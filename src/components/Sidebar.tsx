import React from 'react';
import {
  UserPlus,
  Users,
  Home,
  ClipboardCheck,
  UserCog,
  History,
  Package,
  LogOut,
} from 'lucide-react';
import type { TabType } from '../types/student';
import type { User } from '../types/auth';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  currentUser: User & { can_manage?: boolean };
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
}) => {
  const isAdmin = currentUser.role === 'admin';

  return (
    <div
      style={{
        width: '260px',
        backgroundColor: '#0f172a',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 16px',
        boxSizing: 'border-box',
        height: '100vh',
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ marginBottom: '24px', paddingLeft: '8px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Quản Lý Sinh Viên TDC
          </h2>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Quản Lý QPAN Về Sinh Viên
          </p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* TẤT CẢ CÁN BỘ ĐỀU THẤY CÁC TAB NGHIỆP VỤ NÀY */}
          <button
            onClick={() => setActiveTab('add')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'add' ? '#2563eb' : 'transparent',
              color: activeTab === 'add' ? '#ffffff' : '#cbd5e1',
              fontWeight: activeTab === 'add' ? 600 : 500,
              fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <UserPlus size={18} /> Thêm Sinh Viên
          </button>

          <button
            onClick={() => setActiveTab('manage')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'manage' ? '#2563eb' : 'transparent',
              color: activeTab === 'manage' ? '#ffffff' : '#cbd5e1',
              fontWeight: activeTab === 'manage' ? 600 : 500,
              fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <Users size={18} /> Quản Lý & Điểm Danh
          </button>

          <button
            onClick={() => setActiveTab('rooms')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'rooms' ? '#2563eb' : 'transparent',
              color: activeTab === 'rooms' ? '#ffffff' : '#cbd5e1',
              fontWeight: activeTab === 'rooms' ? 600 : 500,
              fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <Home size={18} /> Phân Phòng KTX
          </button>

          <button
            onClick={() => setActiveTab('scoring')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'scoring' ? '#2563eb' : 'transparent',
              color: activeTab === 'scoring' ? '#ffffff' : '#cbd5e1',
              fontWeight: activeTab === 'scoring' ? 600 : 500,
              fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <ClipboardCheck size={18} /> Chấm Điểm Nề Nếp
          </button>

          <button
            onClick={() => setActiveTab('borrow-list')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'borrow-list' ? '#2563eb' : 'transparent',
              color: activeTab === 'borrow-list' ? '#ffffff' : '#cbd5e1',
              fontWeight: activeTab === 'borrow-list' ? 600 : 500,
              fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <Package size={18} /> Sinh Viên Thuê Trang Phục
          </button>

          <button
            onClick={() => setActiveTab('history')}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
              borderRadius: '8px', border: 'none',
              backgroundColor: activeTab === 'history' ? '#2563eb' : 'transparent',
              color: activeTab === 'history' ? '#ffffff' : '#cbd5e1',
              fontWeight: activeTab === 'history' ? 600 : 500,
              fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <History size={18} /> Lịch Sử Khóa Học
          </button>

          {/* CHỈ ADMIN MỚI THẤY TAB QUẢN LÝ CÁN BỘ */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('users')}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                borderRadius: '8px', border: 'none',
                backgroundColor: activeTab === 'users' ? '#2563eb' : 'transparent',
                color: activeTab === 'users' ? '#ffffff' : '#cbd5e1',
                fontWeight: activeTab === 'users' ? 600 : 500,
                fontSize: '14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
              }}
            >
              <UserCog size={18} /> Quản Lý Cán Bộ
            </button>
          )}
        </nav>
      </div>

      <div
        style={{
          borderTop: '1px solid #334155',
          paddingTop: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ paddingLeft: '4px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
            {currentUser.name}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
            Vai trò: {currentUser.role === 'admin' ? 'Quản trị viên' : 'Cán bộ'}
          </div>
        </div>

        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
            borderRadius: '6px', border: '1px solid #475569',
            backgroundColor: 'transparent', color: '#f87171',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
    </div>
  );
};