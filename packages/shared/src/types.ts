// Modèle de données Firestore de ParentEcole.
//
// Arborescence :
//   superadmins/{email}
//   members/{email}                      personnel d'une école (directeur, agents)
//   schools/{schoolId}
//   schools/{schoolId}/classes/{id}
//   schools/{schoolId}/fees/{id}
//   schools/{schoolId}/announcements/{id}
//   schools/{schoolId}/events/{id}
//   schools/{schoolId}/homework/{id}
//   schools/{schoolId}/evaluations/{id}        interrogations, devoirs notés, examens
//   schools/{schoolId}/timetables/{classId}    horaire de la semaine d'une classe
//   schools/{schoolId}/permissions/{id}        autorisations de sortie à signer
//   schools/{schoolId}/slots/{id}              créneaux de rendez-vous avec un enseignant
//   schools/{schoolId}/documents/{id}          documents de l'école (liens)
//   schools/{schoolId}/announcements/{id}/acks/{uid}   confirmations de lecture
//   schools/{schoolId}/events/{id}/rsvps/{uid}         réponses aux réunions
//   students/{studentId}
//   students/{studentId}/parents/{uid}     liaison parent ↔ élève
//   students/{studentId}/attendance/{date}
//   students/{studentId}/payments/{id}
//   students/{studentId}/conduct/{id}
//   students/{studentId}/homeworkSeen/{homeworkId}
//   students/{studentId}/grades/{evaluationId}
//   students/{studentId}/bulletins/{année_période}
//   students/{studentId}/permissionAnswers/{permissionId}
//   students/{studentId}/requests/{id}     demandes des parents (attestation, personne autorisée…)
//   codes/{matricule}                      matricule → élève (lecture par ID uniquement)
//   schoolParents/{schoolId}_{uid}         donne aux parents l'accès aux infos de l'école
//   users/{uid}                            préférences et jetons de notification

export type StaffRole = 'admin' | 'surveillant' | 'professeur' | 'caissier';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Direction',
  surveillant: 'Surveillant',
  professeur: 'Professeur',
  caissier: 'Caissier',
};

/** Date au format AAAA-MM-JJ. */
export type ISODate = string;

export interface School {
  id: string;
  name: string;
  address: string;
  phone: string;
  /** Symbole affiché après les montants : « $ » ou « FC ». */
  currency: string;
  /** Préfixe des matricules, ex. « HORZ ». */
  codePrefix: string;
  adminEmail: string;
  active: boolean;
  createdAt: string;
  /** Adresse de contact affichée aux parents. */
  email?: string;
  /** Ex. « Lundi au vendredi, 7:30 – 12:30 ». */
  hours?: string;
  directorName?: string;
  /** Année scolaire en cours, ex. « 2026-2027 » (sinon déduite de la date). */
  schoolYear?: string;
  /** Logo de l'école en image compressée (data URL), affiché aux parents et sur les cartes. */
  logo?: string;
  /** Cours le samedi : sinon le samedi est compté comme jour sans cours. */
  saturdayClasses?: boolean;
}

export interface Member {
  /** E-mail en minuscules, aussi utilisé comme ID du document. */
  email: string;
  schoolId: string;
  role: StaffRole;
  name: string;
  phone?: string;
  /** Classes suivies (professeur, surveillant de section). */
  classIds: string[];
  active: boolean;
  createdAt: string;
}

export interface ClassRoom {
  id: string;
  schoolId: string;
  name: string;
  level: string;
  titulaireEmail?: string;
  titulaireName?: string;
  /** Branches enseignées et leurs maxima (pour les notes et les bulletins). */
  subjects?: Subject[];
}

export interface Student {
  id: string;
  schoolId: string;
  classId: string;
  className: string;
  firstName: string;
  lastName: string;
  gender: 'M' | 'F';
  birthDate?: ISODate;
  matricule: string;
  parentName: string;
  parentPhone: string;
  /** Second numéro (autre parent ou tuteur), facultatif. */
  parentPhone2?: string;
  /** Numéros autorisés à lier un compte parent (9 derniers chiffres). */
  parentPhoneKeys: string[];
  parentEmail?: string;
  hasTransport: boolean;
  hasCantine: boolean;
  /** Frais « spéciaux » attribués individuellement. */
  customFeeIds: string[];
  active: boolean;
  createdAt: string;
  bloodType?: string;
  allergies?: string;
  medicalNotes?: string;
  /** Qui appeler en cas d'urgence. */
  emergencyContact?: string;
  /** Personnes autorisées à récupérer l'enfant à la sortie. */
  pickups?: PickupPerson[];
}

export interface PickupPerson {
  name: string;
  relation: string;
  phone: string;
}

export type FeeType = 'tuition' | 'transport' | 'cantine' | 'special';

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  tuition: 'Minerval',
  transport: 'Transport',
  cantine: 'Cantine',
  special: 'Frais spécial',
};

export interface FeeInstallment {
  id: string;
  name: string;
  amount: number;
  dueDate: ISODate;
  /** Date de renvoi : les élèves sous le seuil sont renvoyés ce jour-là. */
  cutoffDate: ISODate;
  /** Montant cumulé à avoir payé pour cette catégorie à la date de renvoi. */
  minimumCumulative: number;
}

export interface FeeCategory {
  id: string;
  schoolId: string;
  name: string;
  type: FeeType;
  totalAmount: number;
  /** Classes concernées ; vide = toutes les classes. */
  classIds: string[];
  installments: FeeInstallment[];
}

export type PaymentMethod = 'Espèces' | 'Mobile Money' | 'Virement bancaire' | 'Chèque';
export const PAYMENT_METHODS: PaymentMethod[] = ['Espèces', 'Mobile Money', 'Virement bancaire', 'Chèque'];

export interface Payment {
  id: string;
  studentId: string;
  schoolId: string;
  studentName: string;
  className: string;
  feeId: string;
  feeName: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  date: ISODate;
  notes?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'En retard',
  excused: 'Absence justifiée',
};

export type JustificationStatus = 'pending' | 'accepted' | 'rejected';

export interface Attendance {
  /** = date (un document par élève et par jour). */
  id: ISODate;
  studentId: string;
  schoolId: string;
  classId: string;
  studentName: string;
  date: ISODate;
  status: AttendanceStatus;
  reason?: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  /** Justification envoyée par le parent. */
  justification?: string;
  justifiedAt?: string;
  justificationStatus?: JustificationStatus;
}

export interface Homework {
  id: string;
  schoolId: string;
  classId: string;
  className: string;
  subject: string;
  title: string;
  description: string;
  dueDate: ISODate;
  teacherName: string;
  createdBy: string;
  createdAt: string;
}

export type ConductType =
  | 'Élève de la semaine'
  | 'Félicitation'
  | 'Observation positive'
  | 'Observation'
  | 'Avertissement'
  | 'Retard récurrent'
  | 'Absence injustifiée'
  | 'Exclusion temporaire';

export type ConductSeverity = 'positive' | 'info' | 'warning' | 'danger';

export const CONDUCT_TYPES: { type: ConductType; severity: ConductSeverity; points: number }[] = [
  { type: 'Élève de la semaine', severity: 'positive', points: 5 },
  { type: 'Félicitation', severity: 'positive', points: 3 },
  { type: 'Observation positive', severity: 'positive', points: 1 },
  { type: 'Observation', severity: 'info', points: 0 },
  { type: 'Avertissement', severity: 'warning', points: -1 },
  { type: 'Retard récurrent', severity: 'warning', points: -1 },
  { type: 'Absence injustifiée', severity: 'warning', points: -2 },
  { type: 'Exclusion temporaire', severity: 'danger', points: -5 },
];

export interface Conduct {
  id: string;
  studentId: string;
  schoolId: string;
  classId: string;
  studentName: string;
  type: ConductType;
  severity: ConductSeverity;
  title: string;
  comment: string;
  date: ISODate;
  author: string;
  createdBy: string;
  createdAt: string;
  /** Points de conduite (positifs ou négatifs) ; absent = valeur par défaut du type. */
  points?: number;
}

export type AnnouncementCategory = 'Général' | 'Urgent' | 'Pédagogique' | 'Financier' | 'Congés';
export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = ['Général', 'Urgent', 'Pédagogique', 'Financier', 'Congés'];

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  /** Classes visées ; vide = toute l'école. */
  classIds: string[];
  publishedAt: string;
  author: string;
  /** Les parents doivent confirmer l'avoir lu. */
  important?: boolean;
}

export type EventCategory = 'Examen' | 'Réunion' | 'Congé' | 'Activité' | 'Paiement';
export const EVENT_CATEGORIES: EventCategory[] = ['Examen', 'Réunion', 'Congé', 'Activité', 'Paiement'];

export interface SchoolEvent {
  id: string;
  schoolId: string;
  title: string;
  date: ISODate;
  category: EventCategory;
  description?: string;
  /** Dernier jour pour une période (vacances) ; absent = un seul jour. */
  endDate?: ISODate;
  /** « 9:00 » */
  time?: string;
  place?: string;
  /** Les parents indiquent s'ils viennent (réunions). */
  rsvp?: boolean;
  /** Classes concernées ; absent ou vide = toute l'école. */
  classIds?: string[];
}

export interface ParentLink {
  uid: string;
  studentId: string;
  schoolId: string;
  /** Les 9 derniers chiffres du téléphone, vérifiés par les règles Firestore. */
  phone: string;
  email: string;
  name: string;
  linkedAt: string;
}

export interface HomeworkSeen {
  homeworkId: string;
  studentId: string;
  schoolId: string;
  classId: string;
  uid: string;
  seenAt: string;
}

export interface StudentCode {
  studentId: string;
  schoolId: string;
}

// ── Périodes, branches, notes et bulletins (système scolaire de la RDC) ────

/** Quatre périodes et deux examens semestriels. */
export type PeriodId = 'P1' | 'P2' | 'EX1' | 'P3' | 'P4' | 'EX2';
/** Bulletins : une période, un examen, un semestre (S1, S2) ou le bilan annuel (AN). */
export type BulletinPeriod = PeriodId | 'S1' | 'S2' | 'AN';

export interface Subject {
  id: string;
  name: string;
  /** Maximum de points par période. */
  max: number;
  /** Maximum à l'examen (par défaut le double du maximum de période). */
  examMax?: number;
}

export interface Evaluation {
  id: string;
  schoolId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  /** Année scolaire, ex. « 2026-2027 ». */
  year: string;
  period: PeriodId;
  /** « Interrogation n° 2 », « Dictée »… */
  title: string;
  date: ISODate;
  /** Note maximale de l'évaluation, ex. 20. */
  max: number;
  teacherName: string;
  createdBy: string;
  createdAt: string;
  /** Nombre d'élèves notés et moyenne de la classe (même échelle que `max`). */
  count: number;
  average: number;
}

/** Note d'un élève à une évaluation (identifiant = celui de l'évaluation). */
export interface Grade {
  id: string;
  evaluationId: string;
  studentId: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  year: string;
  period: PeriodId;
  title: string;
  date: ISODate;
  /** null = absent ou non noté. */
  score: number | null;
  max: number;
  comment?: string;
  createdBy: string;
  updatedAt: string;
}

export interface BulletinLine {
  subjectId: string;
  subject: string;
  max: number;
  /** null = branche pas encore notée. */
  points: number | null;
}

export interface Bulletin {
  /** « 2026-2027_P1 » */
  id: string;
  studentId: string;
  schoolId: string;
  classId: string;
  className: string;
  studentName: string;
  year: string;
  period: BulletinPeriod;
  periodLabel: string;
  lines: BulletinLine[];
  totalMax: number;
  totalPoints: number;
  percent: number;
  /** Place dans la classe (null si non classé). */
  rank: number | null;
  classSize: number;
  application?: string;
  conduct?: string;
  appreciation?: string;
  decision?: string;
  publishedAt: string;
  publishedBy: string;
}

export const MENTIONS = ['Élite', 'Très bien', 'Bien', 'Assez bien', 'Médiocre', 'Mauvais'] as const;

// ── Horaire ────────────────────────────────────────────────────────────────

/** 1 = lundi … 6 = samedi. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAY_LABELS: Record<Weekday, string> = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' };

export interface TimetableSlot {
  day: Weekday;
  /** « 07:30 » */
  start: string;
  end: string;
  subject: string;
  teacher?: string;
  room?: string;
}

export interface Timetable {
  /** = identifiant de la classe */
  id: string;
  schoolId: string;
  classId: string;
  slots: TimetableSlot[];
  updatedAt: string;
  updatedBy: string;
}

// ── Confirmations des parents ──────────────────────────────────────────────

/** Confirmation de lecture d'un communiqué important (identifiant = uid du parent). */
export interface Acknowledgement {
  uid: string;
  name: string;
  at: string;
}

export type RsvpAnswer = 'yes' | 'no';

/** Réponse d'un parent à une réunion (identifiant = uid du parent). */
export interface Rsvp {
  uid: string;
  name: string;
  answer: RsvpAnswer;
  at: string;
}

// ── Autorisations de sortie ────────────────────────────────────────────────

export interface PermissionSlip {
  id: string;
  schoolId: string;
  title: string;
  description: string;
  date: ISODate;
  time?: string;
  /** Participation demandée, dans la monnaie de l'école. */
  cost?: number;
  /** Dernier jour pour répondre. */
  deadline: ISODate;
  /** Classes concernées ; vide = toute l'école. */
  classIds: string[];
  createdBy: string;
  createdAt: string;
}

export interface PermissionAnswer {
  /** = identifiant de l'autorisation */
  id: string;
  permissionId: string;
  studentId: string;
  schoolId: string;
  classId: string;
  studentName: string;
  answer: RsvpAnswer;
  uid: string;
  parentName: string;
  at: string;
}

// ── Rendez-vous avec un enseignant ─────────────────────────────────────────

export type SlotStatus = 'open' | 'requested' | 'confirmed' | 'declined';

export interface AppointmentSlot {
  id: string;
  schoolId: string;
  teacherEmail: string;
  teacherName: string;
  date: ISODate;
  start: string;
  end: string;
  place?: string;
  /** Classes dont les parents peuvent réserver ce créneau. */
  classIds: string[];
  status: SlotStatus;
  bookedBy?: string;
  bookedByName?: string;
  studentId?: string;
  studentName?: string;
  note?: string;
  bookedAt?: string;
  createdAt: string;
}

// ── Demandes des parents ───────────────────────────────────────────────────

export type RequestType = 'attestation' | 'pickup' | 'info';
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  attestation: 'Attestation de fréquentation',
  pickup: 'Personne autorisée à récupérer l’enfant',
  info: 'Correction d’une information',
};

export type RequestStatus = 'pending' | 'done' | 'rejected';

export interface ParentRequest {
  id: string;
  studentId: string;
  schoolId: string;
  classId: string;
  studentName: string;
  type: RequestType;
  details: string;
  /** Pour une demande « personne autorisée ». */
  pickup?: PickupPerson;
  status: RequestStatus;
  uid: string;
  parentName: string;
  createdAt: string;
  answer?: string;
  handledBy?: string;
  handledAt?: string;
}

// ── Documents de l'école (liens : pas de stockage de fichiers) ─────────────

export type DocumentCategory = 'Règlement' | 'Calendrier' | 'Fournitures' | 'Formulaire' | 'Autre';
export const DOCUMENT_CATEGORIES: DocumentCategory[] = ['Règlement', 'Calendrier', 'Fournitures', 'Formulaire', 'Autre'];

export interface SchoolDocument {
  id: string;
  schoolId: string;
  title: string;
  url: string;
  category: DocumentCategory;
  createdAt: string;
}

// ── Préférences d'un parent (users/{uid}) ──────────────────────────────────

export type NotifCategory = 'presences' | 'notes' | 'devoirs' | 'frais' | 'annonces' | 'agenda' | 'conduite';
export const NOTIF_CATEGORIES: { id: NotifCategory; label: string; hint: string }[] = [
  { id: 'presences', label: 'Présences et absences', hint: 'Retards, absences, justifications' },
  { id: 'notes', label: 'Notes et bulletins', hint: 'Chaque nouvelle note, chaque bulletin' },
  { id: 'devoirs', label: 'Devoirs', hint: 'Les nouveaux devoirs de la classe' },
  { id: 'frais', label: 'Frais et reçus', hint: 'Reçus de paiement' },
  { id: 'annonces', label: "Annonces de l'école", hint: 'Communiqués, journées sans cours' },
  { id: 'agenda', label: 'Agenda et rendez-vous', hint: 'Réunions, sorties, rendez-vous, demandes' },
  { id: 'conduite', label: 'Conduite', hint: 'Félicitations et remarques' },
];

export interface UserPrefs {
  /** Catégorie à false = pas de notification de ce type. */
  notif?: Partial<Record<NotifCategory, boolean>>;
  /** Heures calmes de 21 h à 6 h (heure du téléphone). */
  quiet?: boolean;
  /** Décalage horaire du téléphone en minutes (pour les heures calmes). */
  tzOffset?: number;
}

/** Appareil qui reçoit les notifications. */
export interface UserDevice {
  token: string;
  label: string;
  platform: string;
  lastSeen: string;
}
