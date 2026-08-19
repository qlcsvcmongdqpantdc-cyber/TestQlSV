import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { AddStudent } from './components/AddStudent';
import { Login } from './components/Login';
import { UserManagement } from './components/UserManagement';
import { ManageStudents } from './components/ManageStudents';
import { RoomAllocation } from './components/RoomAllocation';
import { RoomScoring } from './components/RoomScoring';
import { CourseHistory } from './components/CourseHistory';
import { BorrowList } from './components/BorrowList';
import { supabase } from './supabaseClient';
import type { Student, TabType } from './types/student';
import type { User } from './types/auth';

const HARDCODED_ADMIN: User & { can_manage?: boolean } = {
  id: 'admin-fixed',
  username: 'admin',
  password: '123',
  name: 'Quản Trị Viên (Admin)',
  role: 'admin',
  can_manage: true,
};

export function App() {
  const [currentUser, setCurrentUser] = useState<(User & { can_manage?: boolean }) | null>(() => {
    const savedUser = sessionStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [users, setUsers] = useState<(User & { can_manage?: boolean })[]>([HARDCODED_ADMIN]);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeTab, setActiveTab] = useState<string>('manage');
  
  // State quản lý việc đóng/mở sidebar trên mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Theo dõi kích thước màn hình để tự động cập nhật trạng thái mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const canManage = currentUser?.role === 'admin' || currentUser?.can_manage === true;
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (currentUser && currentUser.id !== 'admin-fixed') {
      const latestUser = users.find((u) => String(u.id) === String(currentUser.id));
      if (latestUser) {
        if (latestUser.can_manage !== currentUser.can_manage || latestUser.role !== currentUser.role) {
          const updated = { ...currentUser, ...latestUser };
          setCurrentUser(updated);
          sessionStorage.setItem('currentUser', JSON.stringify(updated));
        }
      }
    }
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      if (activeTab === 'users' && !isAdmin) {
        setActiveTab('manage');
      }
    }
  }, [currentUser, isAdmin, activeTab]);

  const fetchStudentsFromSupabase = async () => {
    if (!currentUser) {
      setStudents([]);
      return;
    }

    const { data, error } = await supabase
      .from('DanhSachSinhVien')
      .select('*')
      .order('STT', { ascending: true });

    if (error) {
      console.error('Lỗi lấy danh sách sinh viên:', error.message);
    } else if (data) {
      const mappedStudents: Student[] = data.map((item) => ({
        id: String(item.STT || item.MSSV || item.id || ''),
        studentId: String(item.MSSV || item.MSV || item.studentId || '').trim(),
        name: String(item.HoVaTen || item.Ten || item.name || ''),
        gender: String(item.GioiTinh || item.gender || 'Nam'),
        className: String(item.Lop || item.className || ''),
        room: item.Phong || item.TenPhong || item.room || null,
        thayCo: item.ThayCo || item.thayCo || null, 
        isAbsent:
          item.Vang === 'x' ||
          item.Vang === '1' ||
          item.Vang === true ||
          item.Vang === 'true',
        isLate:
          item.DiTre === 'x' ||
          item.DiTre === '1' ||
          item.DiTre === true ||
          item.DiTre === 'true',
        isBorrow:
          item.MuonDo === 'x' ||
          item.MuonDo === '1' ||
          item.MuonDo === true ||
          item.MuonDo === 'true',
        truongPhong: item.GhiChu === 'x' ? 'x' : null,
      }));
      setStudents(mappedStudents);
    }
  };

  const fetchUsersFromSupabase = async () => {
    const { data, error } = await supabase.from('User').select('*');
    if (!error && data) {
      const mappedUsers: (User & { can_manage?: boolean })[] = data.map((item) => ({
        id: String(item.id),
        username: item.UserName,
        password: item.PassW,
        name: item.HoTen,
        role: item.VaiTro || 'user',
        can_manage: !!item.can_manage,
      }));
      setUsers([HARDCODED_ADMIN, ...mappedUsers]);
    }
  };

  useEffect(() => {
    fetchUsersFromSupabase();
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchStudentsFromSupabase();
    }
  }, [currentUser]);

  const handleAddStudents = async (newStudents: Student[]) => {
    if (!canManage) {
      alert('Bạn không có quyền thêm hoặc tải file sinh viên!');
      return;
    }
    const formattedData = newStudents.map((s) => ({
      MSSV: s.studentId ? String(s.studentId).trim() : null,
      HoVaTen: s.name,
      GioiTinh: s.gender || 'Nam',
      Lop: s.className,
      Phong: s.room || null,
      ThayCo: s.thayCo || null, 
      Vang: null,
      DiTre: null,
      MuonDo: null,
      GhiChu: null,
    }));

    const { error } = await supabase.from('DanhSachSinhVien').insert(formattedData);

    if (error) {
      throw new Error(error.message);
    } else {
      await fetchStudentsFromSupabase();
    }
  };

  const handleToggleAttendance = async (targetId: string, field: 'isAbsent' | 'isLate' | 'isBorrow') => {
    if (!canManage) {
      alert('Bạn không có quyền thực hiện điểm danh!');
      return;
    }
    const currentStudent = students.find((s) => s.id === targetId || s.studentId === targetId);
    if (!currentStudent) return;

    const newStatus = !currentStudent[field];

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === targetId || s.studentId === targetId) {
          return { ...s, [field]: newStatus };
        }
        return s;
      })
    );

    const updatePayload: Record<string, string | null> = {};
    if (field === 'isAbsent') {
      updatePayload.Vang = newStatus ? 'x' : null;
    } else if (field === 'isLate') {
      updatePayload.DiTre = newStatus ? 'x' : null;
    } else if (field === 'isBorrow') {
      updatePayload.MuonDo = newStatus ? 'x' : null;
    }

    let query = supabase.from('DanhSachSinhVien').update(updatePayload);
    const mssvVal = currentStudent.studentId ? String(currentStudent.studentId).trim() : null;
    const sttVal = currentStudent.id ? Number(currentStudent.id) : null;

    if (mssvVal && mssvVal !== 'undefined') {
      query = query.eq('MSSV', mssvVal);
    } else if (sttVal && !isNaN(sttVal)) {
      query = query.eq('STT', sttVal);
    }

    const { error } = await query.select();
    if (error) {
      alert('Không thể lưu trạng thái vào CSDL: ' + error.message);
      fetchStudentsFromSupabase();
    }
  };

  const handleSetRoomLeader = async (
    leaderStudentId: string | null,
    roomStudentKeys: string[],
    roomName?: string
  ) => {
    if (!canManage) {
      alert('Bạn không có quyền phân phòng hoặc chỉ định trưởng phòng!');
      return;
    }
    const cleanLeaderId = leaderStudentId ? String(leaderStudentId).trim() : null;
    const cleanRoomStudentKeys = roomStudentKeys.map((k) => String(k).trim());

    setStudents((prev) =>
      prev.map((s) => {
        const sKey = String(s.studentId || s.id).trim();
        if (cleanRoomStudentKeys.includes(sKey)) {
          return {
            ...s,
            truongPhong: cleanLeaderId && sKey === cleanLeaderId ? 'x' : null,
            ...(roomName ? { room: roomName } : {}),
          };
        }
        return s;
      })
    );

    for (const stKey of cleanRoomStudentKeys) {
      const isLeader = cleanLeaderId && stKey === cleanLeaderId;
      const targetStudent = students.find((s) => String(s.studentId || s.id).trim() === stKey);
      if (!targetStudent) continue;

      const mssvValue = targetStudent.studentId ? String(targetStudent.studentId).trim() : null;
      const sttValue = targetStudent.id ? Number(targetStudent.id) : null;

      const updatePayload: Record<string, any> = {
        GhiChu: isLeader ? 'x' : null,
      };

      if (roomName) updatePayload.Phong = roomName;

      let query = supabase.from('DanhSachSinhVien').update(updatePayload);
      if (mssvValue && mssvValue !== 'undefined') {
        query = query.eq('MSSV', mssvValue);
      } else if (sttValue && !isNaN(sttValue)) {
        query = query.eq('STT', sttValue);
      }

      const { error } = await query.select();
      if (error) {
        alert(`Lỗi CSDL khi cập nhật Phòng/Ghi chú: ${error.message}`);
        break;
      }
    }
  };

  const handleLogin = (user: User & { can_manage?: boolean }) => {
    const found = users.find((u) => String(u.username) === String(user.username));
    const mergedUser = found ? { ...user, ...found } : user;

    setCurrentUser(mergedUser);
    sessionStorage.setItem('currentUser', JSON.stringify(mergedUser));
    setActiveTab('manage');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('currentUser');
    setStudents([]);
    setActiveTab('manage');
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('User').delete().eq('id', Number(userId));
    if (!error) fetchUsersFromSupabase();
  };

  const handleToggleManage = async (userId: string, currentStatus: boolean) => {
    if (!isAdmin) return;
    try {
      const newStatus = !currentStatus;
      const { error } = await supabase
        .from('User')
        .update({ can_manage: newStatus })
        .eq('id', Number(userId));

      if (error) {
        alert('Lỗi cập nhật quyền trên CSDL: ' + error.message);
        return;
      }

      setUsers((prevUsers) => prevUsers.map((u) => (u.id === userId ? { ...u, can_manage: newStatus } : u)));
      
      if (currentUser && String(currentUser.id) === String(userId)) {
        const updatedCurrentUser = { ...currentUser, can_manage: newStatus };
        setCurrentUser(updatedCurrentUser);
        sessionStorage.setItem('currentUser', JSON.stringify(updatedCurrentUser));
      }
    } catch (err: any) {
      alert('Đã xảy ra lỗi: ' + err.message);
    }
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', width: '100vw', background: '#f8fafc', overflow: 'hidden', position: 'relative' }}>
      
      {/* 1. Nút 3 gạch (Chỉ hiển thị trên điện thoại) */}
      {isMobile && (
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: 1100,
            width: '42px',
            height: '42px',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            fontSize: '22px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
          }}
        >
          ☰
        </button>
      )}

      {/* Lớp nền mờ khi mở menu trên mobile */}
      {isMobile && isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999
          }}
        />
      )}

      {/* 2. Sidebar chính tích hợp ẩn/hiện thông minh */}
      <div 
        className="sidebar-container"
        style={{
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          left: isMobile ? (isSidebarOpen ? '0' : '-100%') : '0',
          height: '100vh',
          zIndex: 1000,
          transition: 'left 0.3s ease-in-out',
          boxShadow: isMobile && isSidebarOpen ? '5px 0 20px rgba(0, 0, 0, 0.4)' : undefined
        }}
      >
        <Sidebar
          activeTab={activeTab as TabType}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (isMobile) setIsSidebarOpen(false);
          }}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </div>

      {/* 3. Phần nội dung chính */}
      <main className="main-content" style={{ flex: 1, padding: isMobile ? '16px' : '32px', paddingTop: isMobile ? '70px' : '32px', overflowY: 'auto', height: '100vh' }}>
        {activeTab === 'add' && !canManage ? (
          <div style={{ textAlign: 'center', marginTop: '60px', padding: '24px', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ color: '#d97706', marginBottom: '8px' }}>Chế độ xem dữ liệu</h2>
            <p style={{ color: '#64748b' }}>Tài khoản của bạn chưa được cấp quyền để <strong>thêm mới hoặc tải file sinh viên</strong>. Bạn chỉ có thể xem nội dung các tab khác.</p>
          </div>
        ) : (
          <>
            {activeTab === 'add' && (
              <AddStudent students={students} onAddStudents={handleAddStudents} currentUser={currentUser} />
            )}

            {activeTab === 'manage' && (
              <ManageStudents
                students={students}
                onToggleAttendance={handleToggleAttendance}
                onRefresh={fetchStudentsFromSupabase}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'rooms' && (
              <RoomAllocation
                students={students}
                setStudents={setStudents}
                onSetRoomLeader={handleSetRoomLeader}
              />
            )}

            {activeTab === 'scoring' && (
              <RoomScoring 
                students={students} 
                currentUser={currentUser} 
              />
            )}

            {activeTab === 'borrow-list' && (
              <BorrowList students={students} />
            )}

            {activeTab === 'history' && (
              <CourseHistory selectedCourseKey="" />
            )}

            {activeTab === 'users' && isAdmin && (
              <UserManagement
                users={users}
                setUsers={setUsers}
                onDeleteUser={handleDeleteUser}
                onToggleManage={handleToggleManage}
                currentUser={currentUser}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;