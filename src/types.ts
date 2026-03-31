export enum UserRole {
  MANAGER = 'manager',
  VIEWER = 'viewer'
}

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  photoURL?: string;
}

export enum ShiftCode {
  OOL = 'OOL',
  BLK = 'BLK',
  PD = 'PD',
  C = 'C',
  WRK = 'WRK',
  OFF = 'OFF',
  NS = 'NS',
  V = 'V',
  U24 = '24U',
  PDP = 'PDP',
  ENT = 'ENT'
}

export interface Technician {
  id: string;
  name: string;
  code: string;
}

export interface Shift {
  techId: string;
  date: string; // YYYY-MM-DD
  code: ShiftCode;
}

export interface SmartParseShiftResult {
  technicianName: string;
  date: string;
  shiftCode: ShiftCode;
  confidence: number;
}

export enum EventCategory {
  WORK = 'work',
  PERSONAL = 'personal',
  OTHER = 'other'
}

export interface ScheduleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  category: EventCategory;
  description?: string;
}