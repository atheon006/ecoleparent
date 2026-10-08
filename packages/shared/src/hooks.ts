import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { fromDoc } from './api/refs';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** Vrai si les données viennent du cache local (hors connexion). */
  fromCache: boolean;
}

/** Délais avant de réessayer un abonnement refusé. */
const RETRY_DELAYS = [600, 1500, 3500];

/**
 * onSnapshot qui réessaie après un refus d'accès. Juste après une inscription, la vérification
 * d'un e-mail ou la liaison d'un enfant, le serveur peut ne pas encore connaître le nouveau droit
 * (jeton pas encore rafraîchi, écriture pas encore arrivée) : sans nouvel essai, l'écran restait
 * vide jusqu'au rechargement de la page.
 */
function listen<S>(
  subscribe: (next: (snap: S) => void, fail: (e: FirestoreError) => void) => Unsubscribe,
  next: (snap: S) => void,
  fail: (e: FirestoreError) => void,
): Unsubscribe {
  let unsub: Unsubscribe | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;
  const start = () => {
    unsub = subscribe(next, (e) => {
      unsub = null;
      if (!stopped && e.code === 'permission-denied' && attempt < RETRY_DELAYS.length) {
        timer = setTimeout(start, RETRY_DELAYS[attempt++]);
        return;
      }
      fail(e);
    });
  };
  start();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsub?.();
  };
}

export const listenQuery = (query: Query, next: (snap: QuerySnapshot) => void, fail: (e: FirestoreError) => void, withMetadata = false) =>
  listen<QuerySnapshot>((n, f) => onSnapshot(query, { includeMetadataChanges: withMetadata }, n, f), next, fail);

export const listenDoc = (ref: DocumentReference, next: (snap: DocumentSnapshot) => void, fail: (e: FirestoreError) => void) =>
  listen<DocumentSnapshot>((n, f) => onSnapshot(ref, n, f), next, fail);

export interface LiveQueryOptions {
  /**
   * Ne garder que les documents enregistrés par le serveur (pas les écritures locales en attente).
   * Utile quand d'autres abonnements en dépendent et seraient refusés tant que le serveur ne les a pas.
   */
  confirmedOnly?: boolean;
}

/**
 * Abonnement temps réel à une requête Firestore. `key` identifie la requête :
 * l'abonnement est refait seulement quand `key` change. `key` à null = pas de requête.
 */
export function useLiveQuery<T>(key: string | null, make: () => Query, options: LiveQueryOptions = {}): Live<T[]> & { pending: number } {
  const [state, setState] = useState<Live<T[]> & { pending: number }>({ data: [], loading: key !== null, error: null, fromCache: false, pending: 0 });
  const makeRef = useRef(make);
  makeRef.current = make;
  const confirmedOnly = options.confirmedOnly ?? false;

  useEffect(() => {
    if (key === null) {
      setState({ data: [], loading: false, error: null, fromCache: false, pending: 0 });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return listenQuery(
      makeRef.current(),
      (snap) => {
        const docs = confirmedOnly ? snap.docs.filter((d) => !d.metadata.hasPendingWrites) : snap.docs;
        setState({
          data: docs.map((d) => ({ ...d.data(), id: d.id }) as T),
          loading: false,
          error: null,
          fromCache: snap.metadata.fromCache,
          pending: snap.docs.length - docs.length,
        });
      },
      (error) => {
        console.warn(`[firestore] ${key}`, error);
        setState({ data: [], loading: false, error, fromCache: false, pending: 0 });
      },
      confirmedOnly,
    );
  }, [key, confirmedOnly]);

  return state;
}

export function useLiveDoc<T>(key: string | null, make: () => DocumentReference): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: key !== null, error: null, fromCache: false });
  const makeRef = useRef(make);
  makeRef.current = make;

  useEffect(() => {
    if (key === null) {
      setState({ data: null, loading: false, error: null, fromCache: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return listenDoc(
      makeRef.current(),
      (snap) => setState({ data: fromDoc<T>(snap), loading: false, error: null, fromCache: snap.metadata.fromCache }),
      (error) => {
        console.warn(`[firestore] ${key}`, error);
        setState({ data: null, loading: false, error, fromCache: false });
      },
    );
  }, [key]);

  return state;
}

/** État du réseau du navigateur. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/**
 * Plusieurs abonnements à la fois (un par enfant, par exemple).
 * Renvoie les résultats indexés par `key` ; se réabonne quand l'ensemble des clés change.
 */
export function useLiveMany<T>(entries: { key: string; make: () => Query | DocumentReference }[]): { data: Record<string, T[]>; loading: boolean } {
  const [data, setData] = useState<Record<string, T[]>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const joined = entries.map((e) => e.key).join('|');
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    const current = entriesRef.current;
    const keys = new Set(current.map((e) => e.key));
    setData((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => keys.has(k))));
    setFailed(new Set());
    const fail = (key: string) => (error: Error) => {
      console.warn(`[firestore] ${key}`, error);
      setFailed((f) => new Set(f).add(key));
    };
    const unsubs = current.map((e) => {
      const target = e.make();
      if (target.type === 'document') {
        return listenDoc(
          target,
          (snap) => {
            const one = fromDoc<T>(snap);
            setData((prev) => ({ ...prev, [e.key]: one ? [one] : [] }));
          },
          fail(e.key),
        );
      }
      return listenQuery(target, (snap) => setData((prev) => ({ ...prev, [e.key]: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T) })), fail(e.key));
    });
    return () => unsubs.forEach((u) => u());
  }, [joined]);

  // En chargement tant qu'une clé n'a reçu ni données ni erreur.
  const loading = entries.some((e) => !(e.key in data) && !failed.has(e.key));
  return { data, loading };
}
