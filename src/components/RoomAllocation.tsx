import React, { useState, useEffect } from 'react';
import { Home, Users, AlertTriangle, ShieldCheck, Crown, UserCheck } from 'lucide-react';
import type { Student } from '../types/student';
import type { User } from '../types/auth';
import './RoomAllocation.css';

interface Room {
  roomNumber: number;
  students: Student[];
  genderType: 'Nữ' | 'Nam' | 'Trống';
  hasPenalized: boolean;
}

interface RoomAllocationProps {
  students: Student[];
  setStudents?: React.Dispatch<React.SetStateAction<Student[]>>;
  onSetRoomLeader?: (leaderStudentId: string | null, roomStudentKeys: string[]) => void;
  onUpdateRoomData?: (roomAssignments: { studentKey: string; roomNumber: number }[]) => void;
  currentUser?: (User & { can_manage?: boolean }) | null;
}

export const RoomAllocation: React.FC<RoomAllocationProps> = ({
  students,
  onSetRoomLeader,
  onUpdateRoomData,
  currentUser,
}) => {
  const MAX_PER_ROOM = 12;
  const INITIAL_ROOMS = 20;

  const [leaders, setLeaders] = useState<Record<number, string>>({});
  const [activeDropdownRoom, setActiveDropdownRoom] = useState<number | null>(null);

  // Ép mặc định là true nếu chưa truyền user để hiển thị nút quản lý luôn
  const canManage = currentUser 
    ? (currentUser.role === 'admin' || currentUser.can_manage === true) 
    : true;

  // --- THUẬT TOÁN SẮP XẾP PHÒNG ---
  const calculateRoomAllocation = (): Room[] => {
    const activeStudents = students.filter((s) => !s.isAbsent);

    const females = activeStudents.filter((s) => s.gender === 'Nữ');
    const femaleRegular = females.filter((s) => !s.isLate);
    const femaleLate = females.filter((s) => s.isLate);
    const sortedFemales = [...femaleRegular, ...femaleLate];

    const males = activeStudents.filter((s) => s.gender !== 'Nữ');
    const maleRegular = males.filter((s) => !s.isLate);
    const maleLate = males.filter((s) => s.isLate);
    const sortedMales = [...maleRegular, ...maleLate];

    let totalRoomsNeeded = Math.ceil(activeStudents.length / MAX_PER_ROOM);
    if (totalRoomsNeeded < INITIAL_ROOMS) {
      totalRoomsNeeded = INITIAL_ROOMS;
    }

    const rooms: Room[] = Array.from({ length: totalRoomsNeeded }, (_, i) => ({
      roomNumber: i + 1,
      students: [],
      genderType: 'Trống',
      hasPenalized: false,
    }));

    let currentRoomIdx = 0;

    const fillGroupToRooms = (group: Student[], gender: 'Nữ' | 'Nam') => {
      if (group.length === 0) return;

      if (
        rooms[currentRoomIdx].students.length > 0 &&
        (rooms[currentRoomIdx].genderType !== gender ||
          rooms[currentRoomIdx].students.length >= MAX_PER_ROOM)
      ) {
        currentRoomIdx++;
      }

      for (const student of group) {
        if (currentRoomIdx >= rooms.length) {
          rooms.push({
            roomNumber: rooms.length + 1,
            students: [],
            genderType: 'Trống',
            hasPenalized: false,
          });
        }

        if (rooms[currentRoomIdx].students.length >= MAX_PER_ROOM) {
          currentRoomIdx++;
          if (currentRoomIdx >= rooms.length) {
            rooms.push({
              roomNumber: rooms.length + 1,
              students: [],
              genderType: 'Trống',
              hasPenalized: false,
            });
          }
        }

        rooms[currentRoomIdx].students.push(student);
        rooms[currentRoomIdx].genderType = gender;
        
        if (student.isLate) {
          rooms[currentRoomIdx].hasPenalized = true;
        }
      }

      if (rooms[currentRoomIdx].students.length > 0) {
        currentRoomIdx++;
      }
    };

    fillGroupToRooms(sortedFemales, 'Nữ');
    fillGroupToRooms(sortedMales, 'Nam');

    return rooms;
  };

  const rooms = calculateRoomAllocation();

  // --- ĐỒNG BỘ DỮ LIỆU PHÒNG XUỐNG DB ---
  useEffect(() => {
    if (!onUpdateRoomData) return;

    const assignments: { studentKey: string; roomNumber: number }[] = [];
    rooms.forEach((room) => {
      room.students.forEach((st) => {
        const studentKey = String(st.studentId || st.id);
        assignments.push({ studentKey, roomNumber: room.roomNumber });
      });
    });

    onUpdateRoomData(assignments);
  }, [students]);

  // --- TẢI TRƯỞNG PHÒNG SẴN CÓ TỪ DỮ LIỆU SINH VIÊN ---
  useEffect(() => {
    const loadedLeaders: Record<number, string> = {};
    rooms.forEach((room) => {
      const leaderStudent = room.students.find((st) => st.truongPhong === 'x');
      if (leaderStudent) {
        const studentKey = String(leaderStudent.studentId || leaderStudent.id);
        loadedLeaders[room.roomNumber] = studentKey;
      }
    });
    setLeaders(loadedLeaders);
  }, [students]);

  // --- HÀM XỬ LÝ CHỌN TRƯỞNG PHÒNG ---
  const handleSelectLeader = (roomNumber: number, studentKey: string) => {
    if (!canManage) return;
    setLeaders((prev) => ({ ...prev, [roomNumber]: studentKey }));
    setActiveDropdownRoom(null);

    const currentRoom = rooms.find((r) => r.roomNumber === roomNumber);
    if (!currentRoom) return;

    const roomStudentKeys = currentRoom.students.map((st) =>
      String(st.studentId || st.id)
    );

    if (onSetRoomLeader) {
      onSetRoomLeader(studentKey, roomStudentKeys);
    }
  };

  // --- HÀM XỬ LÝ HỦY TRƯỞNG PHÒNG ---
  const handleRemoveLeader = (roomNumber: number) => {
    if (!canManage) return;
    setLeaders((prev) => {
      const updated = { ...prev };
      delete updated[roomNumber];
      return updated;
    });
    setActiveDropdownRoom(null);

    const currentRoom = rooms.find((r) => r.roomNumber === roomNumber);
    if (!currentRoom) return;

    const roomStudentKeys = currentRoom.students.map((st) =>
      String(st.studentId || st.id)
    );

    if (onSetRoomLeader) {
      onSetRoomLeader(null, roomStudentKeys);
    }
  };

  const totalAllocated = rooms.reduce((acc, r) => acc + r.students.length, 0);
  const totalPenalized = students.filter((s) => s.isAbsent || s.isLate).length;

  return (
    <div className="room-container">
      {/* HEADER BÁO CÁO */}
      <div className="room-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            Sơ Đồ Phòng KTX QPAN ({rooms.length} Phòng)
          </h2>
          <p>
            Mỗi phòng tối đa 12 SV • Sắp xếp tuần tự theo giới tính • Tự động mở rộng phòng khi vượt sĩ số
          </p>
        </div>

        <div className="room-stats">
          <div className="stat-card">
            <Users size={18} color="#2563eb" />
            <span>Đã xếp: <strong>{totalAllocated}/{students.filter(s => !s.isAbsent).length}</strong> SV</span>
          </div>
          <div className="stat-card warning">
            <AlertTriangle size={18} color="#dc2626" />
            <span>Vi phạm/Trễ: <strong>{totalPenalized}</strong> SV</span>
          </div>
        </div>
      </div>

      {/* GRID PHÒNG */}
      <div className="rooms-grid">
        {rooms.map((room) => {
          const isFull = room.students.length === MAX_PER_ROOM;
          const isEmpty = room.students.length === 0;
          const currentLeaderKey = leaders[room.roomNumber];
          const isDropdownOpen = activeDropdownRoom === room.roomNumber;

          const currentLeaderStudent = room.students.find(
            (st) => String(st.studentId || st.id) === currentLeaderKey
          );

          return (
            <div
              key={room.roomNumber}
              className={`room-card ${isEmpty ? 'empty' : ''} ${room.hasPenalized ? 'penalized-room' : ''}`}
              style={{ position: 'relative' }}
            >
              {/* Header card phòng */}
              <div className="room-card-header">
                <div className="room-title">
                  <Home size={18} />
                  <span>Phòng {room.roomNumber < 10 ? `0${room.roomNumber}` : room.roomNumber}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {!isEmpty && (
                    <span className={`gender-tag ${room.genderType === 'Nữ' ? 'nu' : 'nam'}`}>
                      Phòng {room.genderType}
                    </span>
                  )}

                  {!isEmpty && canManage && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveDropdownRoom(isDropdownOpen ? null : room.roomNumber)
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid #cbd5e1',
                        background: currentLeaderKey ? '#fef9c3' : '#ffffff',
                        color: currentLeaderKey ? '#854d0e' : '#475569',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {currentLeaderKey ? (
                        <>
                          <Crown size={13} color="#eab308" />
                          <span>TP: {currentLeaderStudent?.name || 'Đã chọn'}</span>
                        </>
                      ) : (
                        <>
                          <UserCheck size={13} />
                          <span>Xét TP</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* DROPDOWN CHỌN TRƯỞNG PHÒNG */}
              {isDropdownOpen && !isEmpty && canManage && (
                <div
                  style={{
                    position: 'absolute',
                    top: '42px',
                    right: '12px',
                    zIndex: 20,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    padding: '6px',
                    minWidth: '200px',
                    maxHeight: '220px',
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#64748b',
                      padding: '4px 8px',
                      borderBottom: '1px solid #f1f5f9',
                      marginBottom: '4px',
                    }}
                  >
                    CHỌN TRƯỞNG PHÒNG
                  </div>

                  {currentLeaderKey && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLeader(room.roomNumber)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px',
                        fontSize: '12px',
                        color: '#dc2626',
                        background: '#fef2f2',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginBottom: '4px',
                        fontWeight: 600,
                      }}
                    >
                      ✕ Hủy vị trí Trưởng phòng
                    </button>
                  )}

                  {room.students.map((st, idx) => {
                    const studentKey = String(st.studentId || st.id);
                    const isSelected = currentLeaderKey === studentKey;

                    return (
                      <button
                        key={studentKey + '-' + idx}
                        type="button"
                        onClick={() => handleSelectLeader(room.roomNumber, studentKey)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          fontSize: '12px',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isSelected ? '#fefce8' : 'transparent',
                          color: isSelected ? '#854d0e' : '#334155',
                          fontWeight: isSelected ? 700 : 500,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>
                          {idx + 1}. {st.name}
                        </span>
                        {isSelected && <Crown size={12} color="#eab308" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sức chứa */}
              <div className="room-capacity">
                <span>Sức chứa: <strong>{room.students.length}/{MAX_PER_ROOM}</strong></span>
                <span className={`status-pill ${isFull ? 'full' : isEmpty ? 'free' : 'available'}`}>
                  {isFull ? 'Đã Đầy' : isEmpty ? 'Trống' : 'Còn Chỗ'}
                </span>
              </div>

              {/* Progress bar */}
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${(room.students.length / MAX_PER_ROOM) * 100}%`,
                    backgroundColor: room.hasPenalized
                      ? '#ef4444'
                      : room.genderType === 'Nữ'
                      ? '#ec4899'
                      : '#3b82f6',
                  }}
                />
              </div>

              {/* Danh sách sinh viên */}
              <div className="room-student-list">
                {isEmpty ? (
                  <div className="empty-text">Phòng trống</div>
                ) : (
                  room.students.map((st, idx) => {
                    const studentKey = String(st.studentId || st.id);
                    const isLeader = currentLeaderKey === studentKey;
                    const isPenalized = st.isLate;

                    return (
                      <div
                        key={studentKey + '-' + idx}
                        className={`student-item ${isPenalized ? 'bad-student' : ''}`}
                        style={{
                          backgroundColor: isLeader ? '#fefce8' : undefined,
                          borderColor: isLeader ? '#fde047' : undefined,
                        }}
                      >
                        <span
                          className="st-name"
                          style={{
                            color: isLeader ? '#854d0e' : undefined,
                            fontWeight: isLeader ? 700 : undefined,
                          }}
                        >
                          {isLeader && (
                            <Crown
                              size={14}
                              color="#eab308"
                              style={{ marginRight: 4, verticalAlign: 'middle' }}
                            />
                          )}
                          {idx + 1}. {st.name} ({st.studentId || st.id})
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {st.isLate && <span className="tag-bad late">Trễ</span>}
                          {!isPenalized && !isLeader && <ShieldCheck size={14} color="#16a34a" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};