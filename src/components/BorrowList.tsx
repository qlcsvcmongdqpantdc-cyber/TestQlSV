import { useState, useEffect } from 'react';
import type { Student } from '../types/student';
import { UserCheck, Users, PackageCheck, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import './BorrowList.css';

interface BorrowListProps {
  students: Student[];
}

export function BorrowList({ students }: BorrowListProps) {
  const [selectedTeacher, setSelectedTeacher] = useState<string>('ALL');
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Tự động fetch trực tiếp cột GhiChuMuonDo từ Supabase khi component load lên
  useEffect(() => {
    const fetchNotesFromDB = async () => {
      try {
        const { data, error } = await supabase
          .from('DanhSachSinhVien')
          .select('MSSV, studentId, GhiChuMuonDo');

        if (!error && data) {
          const dbNotes: Record<string, string> = {};
          data.forEach((row: any) => {
            const key = String(row.studentId || row.MSSV);
            if (key) {
              dbNotes[key] = row.GhiChuMuonDo || '';
            }
          });
          setNotes(dbNotes);
        }
      } catch (err) {
        console.error('Lỗi khi tải ghi chú từ database:', err);
      }
    };

    fetchNotesFromDB();
  }, [students]);

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

  // Cập nhật state ghi chú khi gõ
  const handleNoteChange = (studentKey: string, value: string) => {
    setNotes((prev) => ({
      ...prev,
      [studentKey]: value,
    }));
  };

  // Lưu ghi chú lên bảng DanhSachSinhVien tại cột GhiChuMuonDo khi người dùng rời khỏi ô nhập (onBlur)
  const handleNoteBlur = async (student: Student, studentKey: string) => {
    const currentNote = notes[studentKey] || '';
    const msv = student.studentId;

    if (!msv) return;

    try {
      let { error } = await supabase
        .from('DanhSachSinhVien')
        .update({ GhiChuMuonDo: currentNote })
        .eq('MSSV', msv);

      if (error) {
        const { error: errRetry } = await supabase
          .from('DanhSachSinhVien')
          .update({ GhiChuMuonDo: currentNote })
          .eq('studentId', msv);

        if (errRetry) {
          console.error('Lỗi khi lưu ghi chú mượn đồ:', errRetry);
        }
      }
    } catch (err) {
      console.error('Lỗi kết nối khi lưu ghi chú:', err);
    }
  };

  // Hàm xuất file Excel: Mỗi giáo viên là một Sheet riêng theo mẫu chuẩn (có bao gồm Ghi chú)
  const exportMultiSheetExcel = () => {
    const workbook = XLSX.utils.book_new();

    teachers.forEach((teacherName) => {
      const teacherStudents = borrowingStudents.filter((s) => {
        const t = s.thayCo && s.thayCo.trim() !== '' ? s.thayCo : 'Chưa phân công giáo viên';
        return t === teacherName;
      });

      const sheetData = teacherStudents.map((s, index) => {
        const nameParts = s.name ? s.name.trim().split(' ') : [''];
        const firstName = nameParts[nameParts.length - 1];
        const studentKey = String(s.studentId || s.id || index);

        return {
          "STT": index + 1,
          "MSSV": s.studentId || '',
          "Họ và Tên": s.name || '',
          "Tên": firstName,
          "Số lượng": 2, 
          "Đơn vị": "Bộ", 
          "": "", 
          "": "", 
          "Ghi chú": notes[studentKey] || (s.isBorrow ? "" : "NGHỈ")
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const safeSheetName = teacherName.replace(/[:\\/?*\[\]]/g, "").substring(0, 31);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    });

    if (teachers.length === 0) {
      const emptySheet = XLSX.utils.json_to_sheet([{ "Thông báo": "Không có dữ liệu sinh viên mượn đồ" }]);
      XLSX.utils.book_append_sheet(workbook, emptySheet, "DanhSachTrong");
    }

    XLSX.writeFile(workbook, "Danh_Sach_Muon_Do_Theo_Giao_Vien.xlsx");
  };

  return (
    <div className="borrow-container">
      <div className="borrow-header">
        <div className="title-area">
          <h2>
            <PackageCheck className="header-icon" size={24} /> Danh Sách Sinh Viên Mượn Đồ
          </h2>
          <p>Quản lý trang thiết bị và vật dụng mượn theo từng giảng viên phụ trách</p>
        </div>
        <div className="header-actions">
          <div className="total-badge">
            <Users size={16} />
            <span>Tổng mượn: <strong>{borrowingStudents.length}</strong> SV</span>
          </div>
          <button 
            type="button" 
            className="export-excel-btn"
            onClick={exportMultiSheetExcel}
          >
            <FileSpreadsheet size={16} /> Xuất Excel (Mỗi GV 1 Sheet)
          </button>
        </div>
      </div>

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
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, index) => {
                const teacherName = student.thayCo && student.thayCo.trim() !== '' 
                  ? student.thayCo 
                  : 'Chưa phân công';
                
                const studentKey = String(student.studentId || student.id || index);

                return (
                  <tr key={studentKey}>
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
                    <td data-label="Ghi chú">
                      <input
                        type="text"
                        className="note-input"
                        placeholder="Nhập ghi chú..."
                        value={notes[studentKey] || ''}
                        onChange={(e) => handleNoteChange(studentKey, e.target.value)}
                        onBlur={() => handleNoteBlur(student, studentKey)}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '13px',
                          outline: 'none'
                        }}
                      />
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