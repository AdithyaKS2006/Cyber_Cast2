import {
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  Map,
  Bell,
  ShieldCheck,
  FolderLock,
  Smartphone,
} from 'lucide-react';

const ALL_ROLES = ['Analyst', 'Validator', 'Administrator', 'Operator', 'Officer', 'Supervisor'];

export const ALL_MENU_GROUPS = [
  {
    title: 'MAIN',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ALL_ROLES },
    ],
  },
  {
    title: 'COMPLAINTS',
    items: [
      { id: 'complaints',     icon: ClipboardList, label: 'All Complaints', roles: ALL_ROLES },
      { id: 'complaints/new', icon: PlusCircle,     label: 'New Complaint',  roles: ALL_ROLES },
    ],
  },
  {
    title: 'LIVE MAP',
    items: [
      { id: 'predictions/heatmap', icon: Map, label: 'Cash-Out Heatmap', roles: ALL_ROLES },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { id: 'alerts',         icon: Bell,       label: 'Alert Center',    roles: ALL_ROLES },
      { id: 'freeze-ops',     icon: ShieldCheck, label: 'Freeze Queue',   roles: ALL_ROLES },
      { id: 'evidence-locker',icon: FolderLock,  label: 'Evidence Locker',roles: ALL_ROLES },
    ],
  },
  {
    title: 'FIELD',
    items: [
      { id: 'field-mobile', icon: Smartphone, label: 'Officer View', roles: ALL_ROLES },
    ],
  },
];
