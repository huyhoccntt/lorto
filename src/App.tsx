import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Dices, DoorOpen, RotateCcw, Trophy, Users, Wifi, X } from 'lucide-react'
import { io, type Socket } from 'socket.io-client'
import './App.css'

type Player = { id: string; name: string; isHost: boolean; ticket: (number | null)[][][]; status: 'near' | 'kinh' | null }
type Winner = { id: string; name: string; ticketIndex: number; rowIndex: number }
type RoomState = {
  code: string
  hostId: string
  drawnNumbers: number[]
  maxNumber: number
  finished: boolean
  winners: Winner[]
  players: Player[]
}
const currentYear = new Date().getFullYear()

function App() {
  const socketRef = useRef<Socket | null>(null)
  const finishedRef = useRef(false)
  const [socketId, setSocketId] = useState('')
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState<RoomState | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [winnerDialogOpen, setWinnerDialogOpen] = useState(false)

  useEffect(() => {
    const client = io()
    socketRef.current = client
    client.on('connect', () => {
      setConnected(true)
      setSocketId(client.id ?? '')
    })
    client.on('disconnect', () => setConnected(false))
    client.on('room-state', (nextRoom: RoomState) => {
      setRoom(nextRoom)
      setError('')
      if (nextRoom.finished && !finishedRef.current) setWinnerDialogOpen(true)
      if (!nextRoom.finished) setWinnerDialogOpen(false)
      finishedRef.current = nextRoom.finished
    })
    client.on('room-error', (message: string) => setError(message))
    client.on('room-announcement', (message: string) => setAnnouncement(message))
    client.on('room-left', () => {
      setRoom(null)
      setWinnerDialogOpen(false)
      finishedRef.current = false
    })
    return () => {
      client.disconnect()
      socketRef.current = null
    }
  }, [])

  const createRoom = () => {
    if (!playerName.trim()) return setError('Nhập tên của bạn để tạo phòng.')
    setAnnouncement('')
    setWinnerDialogOpen(false)
    socketRef.current?.emit('create-room', { name: playerName.trim() })
  }

  const joinRoom = () => {
    if (!playerName.trim()) return setError('Nhập tên của bạn trước khi vào phòng.')
    if (!roomCode.trim()) return setError('Nhập mã phòng để tiếp tục.')
    setAnnouncement('')
    setWinnerDialogOpen(false)
    socketRef.current?.emit('join-room', { name: playerName.trim(), code: roomCode.trim() })
  }

  const drawNumber = () => socketRef.current?.emit('draw-number')
  const resetRoom = () => {
    setAnnouncement('')
    setWinnerDialogOpen(false)
    socketRef.current?.emit('reset-room')
  }
  const leaveRoom = () => {
    socketRef.current?.emit('leave-room')
    setRoom(null)
    setError('')
    setAnnouncement('')
    setWinnerDialogOpen(false)
  }

  const copyCode = async () => {
    if (!room) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(room.code)
      } else {
        const input = document.createElement('textarea')
        input.value = room.code
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.append(input)
        input.select()
        const success = document.execCommand('copy')
        input.remove()
        if (!success) throw new Error('Copy failed')
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Không sao chép được mã phòng. Hãy chọn và sao chép mã trực tiếp.')
    }
  }

  const currentNumber = room?.drawnNumbers.at(-1)
  const remaining = room ? room.maxNumber - room.drawnNumbers.length : 90
  const currentPlayer = room?.players.find((player) => player.id === socketId)
  const isHost = currentPlayer?.isHost ?? false

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); leaveRoom() }}>
          <span className="brand-mark"><Dices size={19} strokeWidth={2.2} /></span>
          <span>LOTT<span className="wordmark-o">O</span></span>
        </a>
        <div className="topbar-right">
          <span className={`connection ${connected ? 'is-connected' : ''}`}>
            <span className="connection-dot" />{connected ? 'Đang kết nối' : 'Đang nối lại'}
          </span>
          <span className="local-tag"><Wifi size={14} /> LOCAL ROOM</span>
        </div>
      </header>

      {!room ? (
        <section className="lobby">
          <div className="lobby-copy">
            <p className="eyebrow"><span /> BÀN QUAY SỐ TRỰC TIẾP</p>
            <h1>Mỗi lượt quay,<br /><em>cả phòng cùng chờ.</em></h1>
            <p className="lobby-description">Tạo một phòng riêng, gửi mã cho mọi người và bắt đầu quay số cùng nhau.</p>
            <div className="lobby-stats">
              <div><strong>01—90</strong><span>BỘ SỐ</span></div>
              <i />
              <div><strong>REAL TIME</strong><span>ĐỒNG BỘ TRỰC TIẾP</span></div>
            </div>
          </div>

          <div className="entry-panel">
            <div className="panel-heading">
              <span className="panel-index">01</span>
              <div><h2>Vào bàn chơi</h2><p>Bắt đầu bằng tên của bạn</p></div>
            </div>
            <label className="field-label" htmlFor="player-name">TÊN NGƯỜI CHƠI</label>
            <input id="player-name" maxLength={18} placeholder="Ví dụ: Minh Anh" value={playerName} onChange={(event) => setPlayerName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') createRoom() }} />
            <button className="primary-button create-button" onClick={createRoom} disabled={!connected}>
              Tạo phòng mới <span>↗</span>
            </button>
            <div className="or-divider"><span />HOẶC<span /></div>
            <label className="field-label" htmlFor="room-code">MÃ PHÒNG</label>
            <div className="join-row">
              <input id="room-code" maxLength={6} placeholder="Nhập mã 6 ký tự" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/\s/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') joinRoom() }} />
              <button className="join-button" aria-label="Vào phòng" onClick={joinRoom} disabled={!connected}><DoorOpen size={18} /></button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <p className="local-note"><span /> Phòng chạy trên mạng nội bộ của bạn</p>
          </div>
        </section>
      ) : (
        <section className="room-view">
          <div className="room-header">
            <button className="back-button" onClick={leaveRoom}><ArrowLeft size={17} /> Sảnh chờ</button>
            <div className="room-heading">
              <div><p className="eyebrow"><span /> PHÒNG ĐANG HOẠT ĐỘNG</p><h1>Bàn quay số</h1></div>
              <button className="room-code" onClick={copyCode} title="Sao chép mã phòng">
                <span>MÃ PHÒNG</span><strong>{room.code}</strong>{copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {announcement && <div className={`room-announcement ${announcement.includes('đã KINH') ? 'announcement-kinh' : ''}`} role="status"><Dices size={17} /><span>{announcement}</span></div>}

          {room.finished && room.winners.length > 0 && <div className="winner-banner" role="status">
            <span className="winner-icon"><Trophy size={20} /></span>
            <div className="winner-copy">
              <p>VÁN ĐÃ DỪNG</p>
              <strong>{room.winners.map((winner) => winner.name).join(', ')}</strong>
              <span>{room.winners.map((winner) => `Vé ${winner.ticketIndex + 1}, hàng ${winner.rowIndex + 1}`).join(' · ')}</span>
            </div>
            {isHost && <button className="new-round-button" onClick={resetRoom}><RotateCcw size={15} /> Ván mới</button>}
          </div>}

          {room.finished && room.winners.length > 0 && winnerDialogOpen && <div className="winner-overlay">
            <section className="winner-dialog" role="alertdialog" aria-modal="true" aria-labelledby="winner-dialog-title" aria-describedby="winner-dialog-details">
              <button className="winner-close" aria-label="Đóng thông báo" onClick={() => setWinnerDialogOpen(false)}><X size={18} /></button>
              <span className="winner-dialog-icon"><Trophy size={27} /></span>
              <p className="winner-dialog-eyebrow">TRÒ CHƠI ĐÃ KẾT THÚC</p>
              <h2 id="winner-dialog-title">{room.winners.length > 1 ? 'Đồng chiến thắng' : 'Người chiến thắng'}</h2>
              <strong className="winner-dialog-names">{room.winners.map((winner) => winner.name).join(', ')}</strong>
              <p id="winner-dialog-details" className="winner-dialog-details">Đã Kinh ở {room.winners.map((winner) => `vé ${winner.ticketIndex + 1}, hàng ${winner.rowIndex + 1}`).join('; ')}</p>
              {isHost ? <button className="new-round-button winner-next-round" onClick={resetRoom}><RotateCcw size={16} /> Ván mới</button> : <button className="new-round-button winner-next-round" onClick={() => setWinnerDialogOpen(false)}>Đóng</button>}
            </section>
          </div>}

          <div className="room-grid">
            <section className="draw-panel">
              <div className="draw-panel-top"><span>VÒNG QUAY {room.drawnNumbers.length.toString().padStart(2, '0')}</span><span>{remaining} SỐ CÒN LẠI</span></div>
              <div className={`number-stage ${currentNumber ? 'has-number' : ''}`}>
                <div className="stage-ring ring-one" /><div className="stage-ring ring-two" />
                <span className="latest-label">{currentNumber ? 'SỐ VỪA QUAY' : 'SẴN SÀNG'}</span>
                <strong className="drawn-number" key={currentNumber ?? 'empty'}>{currentNumber?.toString().padStart(2, '0') ?? '—'}</strong>
                <span className="stage-caption">{currentNumber ? `Lượt ${room.drawnNumbers.length}` : 'Chờ lượt quay đầu tiên'}</span>
              </div>
              {isHost ? (
                <div className="draw-actions">
                  <button className="primary-button draw-button" onClick={drawNumber} disabled={remaining === 0 || room.finished}><Dices size={19} />{room.finished ? 'Ván đã dừng' : remaining === 0 ? 'Đã hết số' : 'Quay số tiếp theo'}<span>↗</span></button>
                  {!room.finished && <button className="reset-button" onClick={resetRoom} disabled={room.drawnNumbers.length === 0} title="Đặt lại lượt quay"><RotateCcw size={17} /></button>}
                </div>
              ) : <p className="host-hint">Chủ phòng đang điều khiển lượt quay</p>}
              <div className="board-block">
                <div className="section-title board-title">
                  <h2>Vé lô tô của bạn</h2>
                  <span>45 số · 3 vé</span>
                </div>
                <div className="ticket-stack">
                  {currentPlayer?.ticket.map((ticket, ticketIndex) => (
                    <section className="ticket-sheet" key={ticketIndex}>
                      <div className="ticket-card" role="grid" aria-label={`Vé ${ticketIndex + 1}, 3 hàng, 9 cột`}>
                        {ticket.flatMap((row, rowIndex) => row.map((number, columnIndex) => {
                          const drawn = number !== null && room.drawnNumbers.includes(number)
                          return <span className={`ticket-cell ${number === null ? 'ticket-empty' : ''} ${drawn ? 'ticket-drawn' : ''} ${number === currentNumber ? 'ticket-current' : ''}`} role="gridcell" key={`${rowIndex}-${columnIndex}`} aria-label={number === null ? 'Ô trống' : `Số ${number}${drawn ? ', đã quay' : ''}`}>
                            {number?.toString().padStart(2, '0') ?? ''}
                          </span>
                        }))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="history-block">
                <div className="section-title"><h2>Lịch sử quay</h2><span>{room.drawnNumbers.length} / {room.maxNumber}</span></div>
                {room.drawnNumbers.length ? <div className="number-history" role="list" aria-label="Các số đã quay, mới nhất trước">{[...room.drawnNumbers].reverse().map((number, index) => <span className={index === 0 ? 'history-latest' : ''} role="listitem" key={`${number}-${index}`}>{number.toString().padStart(2, '0')}</span>)}</div> : <p className="empty-history">Chưa có số nào được quay.</p>}
              </div>
            </section>

            <aside className="players-panel">
              <div className="section-title"><h2>Người chơi</h2><span className="player-count"><Users size={14} />{room.players.length}</span></div>
              <div className="player-list">{room.players.map((player, index) => <div className="player-row" key={player.id}><span className={`player-avatar avatar-${index % 4}`}>{player.name.slice(0, 1).toUpperCase()}</span><span className="player-name">{player.name}{player.id === socketId && <small>BẠN</small>}</span>{player.status && <span className={`player-status status-${player.status}`}>{player.status === 'kinh' ? 'KINH' : 'SẮP KINH'}</span>}{player.isHost && <span className="host-badge">CHỦ PHÒNG</span>}</div>)}</div>
              <div className="invite-note"><span className="invite-line" /><p>Chia sẻ mã phòng để mời<br />mọi người vào cùng chơi.</p><button onClick={copyCode}>{copied ? 'Đã sao chép' : 'Sao chép mã'} <Copy size={14} /></button></div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </aside>
          </div>
        </section>
      )}
      <footer className="footer"><span>LOTT<span className="wordmark-o">O</span></span><span>LOCAL MULTIPLAYER · {currentYear}</span></footer>
    </main>
  )
}

export default App
