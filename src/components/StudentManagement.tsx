import React, { useState } from 'react';
import { Search, Clock, UserX, UserCheck, Users, RotateCcw } from 'lucide-react';
import type { Student } from '../types/student';

interface StudentManagementProps {
  students: Student[];
}

type AttendanceStatus = 'present' | 'late' | 'absent';

export const StudentManagement: React.FC<StudentManagementProps> = ({ students }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  
  // Lưu trạng thái điểm danh riêng cho từng sinh viên (mặc định là 'present')
  const [attendance, setAttendance] = useState<{ [key: string]: AttendanceStatus }>({});

  // Cập nhật trạng thái cho sinh viên
  const handleSetStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Lấy danh sách Lớp duy nhất để làm bộ lọc
  const uniqueClasses = Array.from(new Set(students.map((s) => s.className))).filter(Boolean);

  // Lọc danh sách theo từ khóa tìm kiếm và Lớp
  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = filterClass === 'all' || student.className === filterClass;
    return matchesSearch && matchesClass;
  });

  // Thống kê số lượng
  const totalStudents = students.length;
  const lateCount = Object.values(attendance).filter((status) => status === 'late').length;
  const absentCount = Object.values(attendance).filter((status) => status === 'absent').length;
  const presentCount = totalStudents - lateCount - absentCount;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      {/* 1. KHU VỰC THỐNG KÊ (CARDS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Tổng Sinh Viên</span>
            <Users size={20} color="#2563eb" />
          </div>
          <p style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0 0 0', color: '#1e293b' }}>{totalStudents}</p>
        </div>

        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 600 }}>Có Mặt</span>
            <UserCheck size={20} color="#16a34a" />
          </div>
          <p style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0 0 0', color: '#16a34a' }}>{presentCount}</p>
        </div>

        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: '#d97706', fontWeight: 600 }}>Đi Trễ</span>
            <Clock size={20} color="#d97706" />
          </div>
          <p style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0 0 0', color: '#d97706' }}>{lateCount}</p>
        </div>

        <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>Vắng Mặt</span>
            <UserX size={20} color="#dc2626" />
          </div>
          <p style={{ fontSize: '24px', fontWeight: 700, margin: '8px 0 0 0', color: '#dc2626' }}>{absentCount}</p>
        </div>
      </div>

      {/* 2. THANH CÔNG CỤ TÌM KIẾM VÀ BỘ LỌC */}
      <div style={{
        background: '#ffffff', padding: '20px', borderRadius: '12px 12px 0 0', border: '1px solid #e2e8f0', borderBottom: 'none',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px'
      }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>Quản Lý Điểm Danh Sinh Viên</h2>

        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Ô tìm kiếm */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Tìm MSSV hoặc Họ tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Bộ lọc Lớp */}
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', background: '#fff' }}
          >
            <option value="all">Tất cả các Lớp</option>
            {uniqueClasses.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. BẢNG DANH SÁCH SINH VIÊN */}
      <div style={{ background: '#ffffff', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 20px' }}>MSSV</th>
              <th style={{ padding: '12px 20px' }}>Họ Và Tên</th>
              <th style={{ padding: '12px 20px' }}>Giới Tính</th>
              <th style={{ padding: '12px 20px' }}>Lớp</th>
              <th style={{ padding: '12px 20px' }}>Trạng Thái</th>
              <th style={{ padding: '12px 20px', textAlign: 'center' }}>Điểm Danh</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Không tìm thấy sinh viên nào!
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const status = attendance[student.studentId] || 'present';

                return (
                  <tr key={student.studentId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: '#2563eb' }}>{student.studentId}</td>
                    <td style={{ padding: '14px 20px', fontWeight: 500, color: '#1e293b' }}>{student.name}</td>
                    <td style={{ padding: '14px 20px', color: '#64748b' }}>{student.gender || 'Nam'}</td>
                    <td style={{ padding: '14px 20px', color: '#475569' }}>
                      <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500 }}>
                        {student.className}
                      </span>
                    </td>
                    
                    {/* Badge Trạng thái */}
                    <td style={{ padding: '14px 20px' }}>
                      {status === 'present' && (
                        <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          ● Có mặt
                        </span>
                      )}
                      {status === 'late' && (
                        <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          ● Đi trễ
                        </span>
                      )}
                      {status === 'absent' && (
                        <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          ● Vắng
                        </span>
                      )}
                    </td>

                    {/* Nút thao tác Nút Đi trễ & Nút Vắng */}
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        
                        {/* Nút Đi Trễ */}
                        <button
                          type="button"
                          onClick={() => handleSetStatus(student.studentId, 'late')}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', border: '1px solid #fcd34d',
                            background: status === 'late' ? '#d97706' : '#fffbeb',
                            color: status === 'late' ? '#ffffff' : '#b45309',
                            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                          }}
                        >
                          <Clock size={14} /> Đi trễ
                        </button>

                        {/* Nút Vắng */}
                        <button
                          type="button"
                          onClick={() => handleSetStatus(student.studentId, 'absent')}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', border: '1px solid #fca5a5',
                            background: status === 'absent' ? '#dc2626' : '#fef2f2',
                            color: status === 'absent' ? '#ffffff' : '#b91c1c',
                            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s'
                          }}
                        >
                          <UserX size={14} /> Vắng
                        </button>

                        {/* Nút Đặt lại / Có mặt */}
                        {status !== 'present' && (
                          <button
                            type="button"
                            onClick={() => handleSetStatus(student.studentId, 'present')}
                            style={{
                              padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                              background: '#ffffff', color: '#64748b', fontSize: '12px', cursor: 'pointer',
                              display: 'flex', alignItems: 'center'
                            }}
                            title="Đặt lại trạng thái Có mặt"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};