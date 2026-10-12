// Icônes de l'app parent : Lucide (licence ISC), trait fin, couleur du texte.
// Les noms restent ceux utilisés dans les écrans ; le logo Google garde ses vraies couleurs.

import { cx } from '@pe/shared/ui';
import {
  Award,
  BadgeCheck,
  Bell,
  BookOpenText,
  BriefcaseMedical,
  Building2,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  ChartLine,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Church,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  CloudCheck,
  Contrast,
  Download,
  Droplet,
  Earth,
  FileText,
  FlaskConical,
  Folder,
  GraduationCap,
  Handshake,
  HeartPulse,
  Hourglass,
  House,
  IdCard,
  Info,
  Languages,
  LayoutGrid,
  Lightbulb,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Medal,
  Megaphone,
  MonitorSmartphone,
  Moon,
  NotebookPen,
  Palette,
  PenLine,
  Pencil,
  PersonStanding,
  Phone,
  Plus,
  Presentation,
  Receipt,
  Scale,
  School,
  ScrollText,
  Settings,
  Share,
  Share2,
  ShieldCheck,
  Signature,
  Smartphone,
  Smile,
  Star,
  ThumbsUp,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';

const ICONS = {
  bell: Bell,
  'book-open-text': BookOpenText,
  buildings: Building2,
  'calendar-blank': Calendar,
  'calendar-check': CalendarCheck,
  'calendar-plus': CalendarPlus,
  'calendar-x': CalendarX,
  'caret-down': ChevronDown,
  'caret-left': ChevronLeft,
  'caret-right': ChevronRight,
  certificate: Award,
  'chalkboard-teacher': Presentation,
  'chart-line-up': ChartLine,
  check: Check,
  'check-circle': CircleCheck,
  'circle-half': Contrast,
  clock: Clock,
  'cloud-check': CloudCheck,
  'device-mobile': Smartphone,
  devices: MonitorSmartphone,
  'download-simple': Download,
  drop: Droplet,
  'envelope-simple': Mail,
  export: Share,
  'file-pdf': FileText,
  'file-text': FileText,
  'first-aid-kit': BriefcaseMedical,
  flask: FlaskConical,
  'folder-simple': Folder,
  'gear-six': Settings,
  'globe-hemisphere-east': Earth,
  'graduation-cap': GraduationCap,
  handshake: Handshake,
  heartbeat: HeartPulse,
  hourglass: Hourglass,
  house: House,
  'identification-card': IdCard,
  info: Info,
  lightbulb: Lightbulb,
  'lock-key': LockKeyhole,
  'map-pin': MapPin,
  'math-operations': Calculator,
  medal: Medal,
  megaphone: Megaphone,
  moon: Moon,
  notebook: NotebookPen,
  palette: Palette,
  'pen-nib': PenLine,
  'pencil-simple': Pencil,
  'person-simple-run': PersonStanding,
  phone: Phone,
  plus: Plus,
  question: CircleHelp,
  receipt: Receipt,
  scales: Scale,
  scroll: ScrollText,
  'seal-check': BadgeCheck,
  'share-network': Share2,
  'shield-check': ShieldCheck,
  'sign-out': LogOut,
  signature: Signature,
  smiley: Smile,
  sparkle: Church,
  'squares-four': LayoutGrid,
  star: Star,
  student: School,
  'thumbs-up': ThumbsUp,
  translate: Languages,
  trash: Trash2,
  trophy: Trophy,
  'user-plus': UserPlus,
  'users-three': Users,
  wallet: Wallet,
  'warning-circle': CircleAlert,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS | 'google-logo';

/** Logo Google aux couleurs officielles (bouton « Continuer avec Google »). */
export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function Icon({ name, size = 22, className, label, strokeWidth = 1.75 }: { name: IconName; size?: number; className?: string; label?: string; strokeWidth?: number }) {
  if (name === 'google-logo') return <GoogleLogo size={size} />;
  const Cmp = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={cx('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
