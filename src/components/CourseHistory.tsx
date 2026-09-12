import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import './CourseHistory.css';

interface HistoryRecord {
  id: number;
  MaKhóaHoc?: string;
  MaKhoaHoc?: string;
  Dot: string;
  HocKy: string;
  NamHoc: string;
  MSSV: string;
  HoVaTen: string;
  GioiTinh: string;
  Lop: string;
  Phong: string;
  Vang: string;
  DiTre: string;
  MuonDo?: string;
  GhiChu: string;
  DiemNeNep?: number | string;
}

interface CourseHistoryProps {
  selectedCourseKey?: string | null;
}

export function CourseHistory({ selectedCourseKey: propCourseKey }: CourseHistoryProps) {
  const [data, setData] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 3 ô input để người dùng tự gõ
  const [inputDot, setInputDot] = useState('');
  const [inputHocKy, setInputHocKy] = useState('');
  const [inputNamHoc, setInputNamHoc] = useState('');

  // Trạng thái lưu thông tin đã submit để hiển thị tiêu đề
  const [searchedInfo, setSearchedInfo] = useState<{ dot: string; hocKy: string; namHoc: string } | null>(null);

  useEffect(() => {
    if (propCourseKey) {
      // Xử lý nếu có prop truyền vào từ bên ngoài
    }
  }, [propCourseKey]);

  // Hàm tìm kiếm trực tiếp trên Supabase theo điều kiện người dùng nhập
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!inputDot.trim() && !inputHocKy.trim() && !inputNamHoc.trim()) {
      alert('Vui lòng nhập ít nhất một thông tin (Đợt, Học kỳ hoặc Năm học)!');
      return;
    }

    setLoading(true);

    try {
      let query = supabase.from('KhoaHocDaKetThuc').select('*');

      if (inputDot.trim()) {
        query = query.ilike('Dot', `%${inputDot.trim()}%`);
      }
      if (inputHocKy.trim()) {
        query = query.ilike('HocKy', `%${inputHocKy.trim()}%`);
      }
      if (inputNamHoc.trim()) {
        query = query.ilike('NamHoc', `%${inputNamHoc.trim()}%`);
      }

      const { data: historyData, error: historyError } = await query;

      if (historyError) {
        console.error('Lỗi tải dữ liệu:', historyError.message);
        setLoading(false);
        return;
      }

      const rows = historyData || [];

      // Lấy danh sách MSSV/MSV từ bảng lịch sử khóa học
      const mssvList = rows.map((item: any) => item.MSSV || item.MSV || item.MaSV).filter(Boolean);

      let chamDiemData: any[] = [];
      if (mssvList.length > 0) {
        // Lấy dữ liệu từ bảng ChamDiem (sử dụng MSV làm khóa chính)
        const { data: cdData } = await supabase
          .from('ChamDiem')
          .select('*')
          .in('MSV', mssvList);
        if (cdData) chamDiemData = cdData;
      }

      const ghiChuMap = new Map<string, string>();
      const diemMap = new Map<string, any>();
      
      chamDiemData.forEach((cd: any) => {
        const msv = String(cd.MSV || cd.MSSV || '').trim();
        if (msv) {
          if (cd.GhiChu) {
            ghiChuMap.set(msv, cd.GhiChu);
          }
          if (cd.DiemNeNep !== undefined && cd.DiemNeNep !== null) {
            diemMap.set(msv, cd.DiemNeNep);
          }
        }
      });
      
      const mappedData: HistoryRecord[] = rows.map((item: any) => {
        const mssv = String(item.MSSV || item.MSV || item.MaSV || '').trim();
        let note = ghiChuMap.get(mssv) || item.GhiChu || '';
        
        if (note === 'x' || note === 'X') {
          note = '';
        }

        const diem = diemMap.get(mssv) ?? item.DiemNeNep ?? '';

        return {
          ...item,
          MSSV: mssv,
          GhiChu: note,
          DiemNeNep: diem,
        };
      });

      setData(mappedData);
      setSearchedInfo({ dot: inputDot, hocKy: inputHocKy, namHoc: inputNamHoc });
    } catch (err) {
      console.error('Lỗi hệ thống:', err);
    } finally {
      setLoading(false);
    }
  };

  // Hàm xuất file Excel chuẩn .xlsx đẹp mắt
  const handleExportExcel = () => {
    if (filteredTableData.length === 0) {
      alert('Không có dữ liệu để xuất file!');
      return;
    }

    const excelData = filteredTableData.map((item, index) => ({
      'STT': index + 1,
      'MSSV': item.MSSV || '',
      'Họ và Tên': item.HoVaTen || '',
      'Giới Tính': item.GioiTinh || '',
      'Lớp': item.Lop || '',
      'Phòng': item.Phong || '',
      'Vắng': item.Vang ? 'Vắng' : '',
      'Đi Trễ': item.DiTre ? 'Trễ' : '',
      'Mượn Đồ': item.MuonDo || '',
      'Điểm Nề Nếp': item.DiemNeNep ?? '',
      'Ghi Chú': item.GhiChu || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const colWidths = [
      { wch: 6 },  // STT
      { wch: 15 }, // MSSV
      { wch: 25 }, // Họ và Tên
      { wch: 10 }, // Giới Tính
      { wch: 15 }, // Lớp
      { wch: 12 }, // Phòng
      { wch: 10 }, // Vắng
      { wch: 10 }, // Đi Trễ
      { wch: 15 }, // Mượn Đồ
      { wch: 12 }, // Điểm Nề Nếp
      { wch: 25 }  // Ghi Chú
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'LichSuKhoaHoc');

    const fileName = `LichSuKhoaHoc_${searchedInfo?.dot || 'Dot'}_${searchedInfo?.hocKy || 'HK'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Lọc tìm kiếm nhanh trên bảng kết quả hiện tại
  const filteredTableData = data.filter(
    (item) =>
      item.HoVaTen?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.MSSV?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.Lop?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.MuonDo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.GhiChu?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="history-container">
      {/* Form nhập 3 trường Dot, HocKy, NamHoc */}
      <form onSubmit={handleSearch} className="history-controls" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label className="history-label">Đợt:</label>
          <input
            type="text"
            placeholder="VD: Đợt 5, 5..."
            value={inputDot}
            onChange={(e) => setInputDot(e.target.value)}
            className="history-search-input"
            style={{ width: '160px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label className="history-label">Học Kỳ:</label>
          <input
            type="text"
            placeholder="VD: HK3, 3..."
            value={inputHocKy}
            onChange={(e) => setInputHocKy(e.target.value)}
            className="history-search-input"
            style={{ width: '160px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label className="history-label">Năm Học:</label>
          <input
            type="text"
            placeholder="VD: 2025-2026..."
            value={inputNamHoc}
            onChange={(e) => setInputNamHoc(e.target.value)}
            className="history-search-input"
            style={{ width: '180px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '100%', paddingTop: '22px' }}>
          <button
            type="submit"
            style={{
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            🔍 Xem dữ liệu
          </button>

          {searchedInfo && (
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                padding: '10px 16px',
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📥 Xuất Excel
            </button>
          )}
        </div>
      </form>

      {searchedInfo && (
        <div style={{ marginTop: '16px' }}>
          <input
            type="text"
            placeholder="🔍 Tìm nhanh trong bảng (Họ tên, MSSV, Lớp...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="history-search-input"
            style={{ width: '100%', marginBottom: '16px' }}
          />
        </div>
      )}

      {!searchedInfo ? (
        <div className="history-empty-state">
          <p className="history-empty-text">
            Vui lòng nhập thông tin Đợt, Học kỳ hoặc Năm học ở phía trên và bấm <strong>"Xem dữ liệu"</strong>.
          </p>
        </div>
      ) : (
        <>
          <div className="history-course-header">
            <h2 className="history-course-title">
              Kết quả tìm kiếm: {searchedInfo.dot ? `Đợt ${searchedInfo.dot} ` : ''} 
              {searchedInfo.hocKy ? `- HK${searchedInfo.hocKy} ` : ''} 
              {searchedInfo.namHoc ? `- Năm ${searchedInfo.namHoc}` : ''}
            </h2>
            <p className="history-course-subtitle">
              Tổng số sinh viên tìm thấy: <strong>{data.length}</strong>
            </p>
          </div>

          {loading ? (
            <p style={{ padding: '20px 0', color: '#64748b', textAlign: 'center' }}>Đang tải dữ liệu...</p>
          ) : (
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>MSSV</th>
                    <th>HỌ VÀ TÊN</th>
                    <th>GIỚI TÍNH</th>
                    <th>LỚP</th>
                    <th>PHÒNG</th>
                    <th className="text-center">VẮNG</th>
                    <th className="text-center">ĐI TRỄ</th>
                    <th>MƯỢN ĐỒ</th>
                    <th className="text-center">ĐIỂM</th>
                    <th>GHI CHÚ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableData.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        Không tìm thấy dữ liệu sinh viên phù hợp với thông tin đã nhập.
                      </td>
                    </tr>
                  ) : (
                    filteredTableData.map((item, index) => (
                      <tr key={item.id || index}>
                        <td>{index + 1}</td>
                        <td className="col-mssv">{item.MSSV}</td>
                        <td>{item.HoVaTen}</td>
                        <td>{item.GioiTinh}</td>
                        <td>{item.Lop}</td>
                        <td>{item.Phong || '-'}</td>
                        <td className={`text-center ${item.Vang ? 'icon-check-absent' : 'icon-dash'}`}>
                          {item.Vang ? '✔' : '-'}
                        </td>
                        <td className={`text-center ${item.DiTre ? 'icon-check-late' : 'icon-dash'}`}>
                          {item.DiTre ? '✔' : '-'}
                        </td>
                        <td>{item.MuonDo || '-'}</td>
                        <td className="text-center font-weight-bold">
                          {item.DiemNeNep !== undefined && item.DiemNeNep !== '' ? item.DiemNeNep : '-'}
                        </td>
                        <td>{item.GhiChu || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}