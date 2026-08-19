import { useState } from 'react';
import type { Student } from '../types/student';
import { UserCheck, Users, PackageCheck } from 'lucide-react';
import './BorrowList.css';

interface BorrowListProps {
  students: Student[];
}

export function BorrowList({ students }: BorrowListProps) {
  const [selectedTeacher, setSelectedTeacher] = useState<string>('ALL');

  // Lọc sinh viên mượn đồ
  const borrowingStudents = students.filter((s) => s.isBorrow);

  // Lấy danh sách các giáo viên duy nhất có sinh viên mượn đồ
  const teachers = Array.from(
    new Set(
      borrowingStudents.map((s) => 
        s.thayCo && s.thayCo.trim() !== '' ? s.thayCo : 'Chưa phân công giáo viên'
      )
    )
  );

  // Lọc danh sách sinh viên theo giáo viên đang được chọn
  const filteredStudents = selectedTeacher === 'ALL'
    ? borrowingStudents
    : borrowingStudents.filter((s) => {
        const teacher = s.thayCo && s.thayCo.trim() !== '' ? s.thayCo : 'Chưa phân công giáo viên';
        return teacher === selectedTeacher;
      });

  return (
    <div className="borrow-container">
      {/* Header & Thống kê tổng quan */}
      <div className="borrow-header">
        <div className="title-area">
          <h2>
            <PackageCheck className="header-icon" size={24} /> Danh Sách Sinh Viên Mượn Đồ
          </h2>
          <p>Quản lý trang thiết bị và vật dụng mượn theo từng giảng viên phụ trách</p>
        </div>
        <div className="total-badge">
          <Users size={16} />
          <span>Tổng mượn: <strong>{borrowingStudents.length}</strong> SV</span>
        </div>
      </div>

      {/* Thanh chọn Giáo Viên (Tabs hiện đại) */}
      <div className="teacher-tabs">
        <button
          type="button"
          className={`tab-btn ${selectedTeacher === 'ALL' ? 'active' : ''}`}
          onClick={() => setSelectedTeacher('ALL')}
        >
          🌟 Tất cả giáo viên ({borrowingStudents.length})
        </button>
        {teachers.map((teacher) => {
          const count = borrowingStudents.filter((s) => {
            const t = s.thayCo && s.thayCo.trim() !== '' ? s.thayCo : 'Chưa phân công giáo viên';
            return t === teacher;
          }).length;

          return (
            <button
              type="button"
              key={teacher}
              className={`tab-btn ${selectedTeacher === teacher ? 'active' : ''}`}
              onClick={() => setSelectedTeacher(teacher)}
            >
              👨‍🏫 {teacher} ({count})
            </button>
          );
        })}
      </div>

      {/* Nội dung danh sách */}
      {filteredStudents.length === 0 ? (
        <div className="empty-box">
          <UserCheck size={48} color="#94a3b8" />
          <p>Không có sinh viên nào mượn đồ dưới sự phụ trách này.</p>
        </div>
      ) : (
        <div className="table-wrapper animate-fade">
          <table className="borrow-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>MSSV</th>
                <th>Họ và Tên</th>
                <th>Lớp</th>
                <th>Giảng viên phụ trách</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, index) => {
                const teacherName = student.thayCo && student.thayCo.trim() !== '' 
                  ? student.thayCo 
                  : 'Chưa phân công';

                return (
                  <tr key={student.id || student.studentId}>
                    <td data-label="STT">
                      <span className="stt-pill">{index + 1}</span>
                    </td>
                    <td data-label="MSSV" className="mssv-cell">{student.studentId}</td>
                    <td data-label="Họ và Tên" className="name-cell">{student.name}</td>
                    <td data-label="Lớp">
                      <span className="class-badge">{student.className}</span>
                    </td>
                    <td data-label="Giảng viên phụ trách">
                      <span className="teacher-pill">{teacherName}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BorrowList;