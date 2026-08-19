
export interface Student {
  id?: string;         
  studentId: string; 
  name: string;      
  gender?: string;   
  className: string; 
  stt?: number;        
  isAbsent?: boolean;  
  isLate?: boolean;
  isBorrow?: boolean;
  room?: string;
  truongPhong?: string | null;
  ghiChu?: string | null;
  thayCo?: string | null; // <--- THÊM DÒNG NÀY VÀO
}

export type TabType = 'add' | 'manage' | 'rooms' | 'scoring' | 'history' | 'users' | 'borrow-list';
