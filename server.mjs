import express from 'express'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer)
const rooms = new Map()
const port = Number(process.env.PORT) || 3001
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

app.use(express.static(path.join(projectRoot, 'dist')))
app.use((request, response, next) => {
  if (request.method === 'GET' && request.accepts('html')) {
    response.sendFile(path.join(projectRoot, 'dist', 'index.html'))
    return
  }
  next()
})

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    drawnNumbers: room.drawnNumbers,
    maxNumber: room.maxNumber,
    finished: room.finished,
    winners: room.winners,
    players: [...room.players.values()].map((player) => {
      const rowHits = player.ticket.flatMap((ticket) => ticket.map((row) =>
        row.filter((number) => number !== null && room.drawnNumbers.includes(number)).length,
      ))
      const status = rowHits.includes(5) ? 'kinh' : rowHits.includes(4) ? 'near' : null

      return {
        id: player.id,
        name: player.name,
        isHost: player.id === room.hostId,
        ticket: player.ticket,
        status,
      }
    }),
  }
}

function broadcastRoom(room) {
  io.to(room.code).emit('room-state', roomSnapshot(room))
}

function detachFromRoom(socket) {
  const code = socket.data.roomCode
  if (!code) return
  const room = rooms.get(code)
  socket.leave(code)
  delete socket.data.roomCode
  if (!room) return
  room.players.delete(socket.id)
  if (room.players.size === 0) {
    rooms.delete(code)
    return
  }
  if (room.hostId === socket.id) room.hostId = room.players.keys().next().value
  broadcastRoom(room)
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 18) : ''
}

function createCode() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code
  do {
    code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  } while (rooms.has(code))
  return code
}

function shuffle(items) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]]
  }
  return shuffled
}

function createTicket() {
  const pattern = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [1, 2, 3, 4, 5],
  ]
  const singleColumns = shuffle(Array.from({ length: 9 }, (_, index) => index))
  const ticketRows = Array.from({ length: 3 }, (_, ticketIndex) => {
    const singles = singleColumns.slice(ticketIndex * 3, ticketIndex * 3 + 3)
    const doubles = shuffle(singleColumns.filter((column) => !singles.includes(column)))
    const columnMap = (column) => column < 6 ? doubles[column] : singles[column - 6]
    return pattern.map((row) => row.map(columnMap))
  })
  const tickets = ticketRows.map((rows) => rows.map(() => Array(9).fill(null)))

  for (let column = 0; column < 9; column += 1) {
    const cells = ticketRows.flatMap((rows, ticketIndex) => rows.flatMap((row, rowIndex) =>
      row.includes(column) ? [{ ticketIndex, rowIndex }] : [],
    ))
    const minimum = column === 0 ? 1 : column * 10
    const maximum = column === 8 ? 90 : column * 10 + 9
    const values = shuffle(Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index))
      .slice(0, cells.length)
      .sort((left, right) => left - right)

    cells.forEach(({ ticketIndex, rowIndex }, index) => {
      tickets[ticketIndex][rowIndex][column] = values[index]
    })
  }

  return tickets
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name } = {}) => {
    const playerName = cleanName(name)
    if (!playerName) return socket.emit('room-error', 'Tên người chơi không hợp lệ.')
    detachFromRoom(socket)
    const code = createCode()
    const room = {
      code,
      hostId: socket.id,
      maxNumber: 90,
      drawnNumbers: [],
      finished: false,
      winners: [],
      players: new Map([[socket.id, { id: socket.id, name: playerName, ticket: createTicket() }]]),
    }
    rooms.set(code, room)
    socket.data.roomCode = code
    socket.join(code)
    broadcastRoom(room)
  })

  socket.on('join-room', ({ name, code } = {}) => {
    const playerName = cleanName(name)
    const roomCode = typeof code === 'string' ? code.trim().toUpperCase().replace(/\s/g, '') : ''
    if (!playerName) return socket.emit('room-error', 'Tên người chơi không hợp lệ.')
    const room = rooms.get(roomCode)
    if (!room) return socket.emit('room-error', 'Không tìm thấy phòng này.')
    detachFromRoom(socket)
    room.players.set(socket.id, { id: socket.id, name: playerName, ticket: createTicket() })
    socket.data.roomCode = roomCode
    socket.join(roomCode)
    broadcastRoom(room)
  })

  socket.on('draw-number', () => {
    const room = rooms.get(socket.data.roomCode)
    if (!room || room.hostId !== socket.id || room.finished) return
    const available = Array.from({ length: room.maxNumber }, (_, index) => index + 1)
      .filter((number) => !room.drawnNumbers.includes(number))
    if (!available.length) return
    const number = available[Math.floor(Math.random() * available.length)]
    const previousDrawn = new Set(room.drawnNumbers)
    room.drawnNumbers.push(number)

    const nearAnnouncements = []
    const winners = new Map()
    for (const player of room.players.values()) {
      player.ticket.forEach((ticket, ticketIndex) => {
        ticket.forEach((row, rowIndex) => {
          if (!row.includes(number)) return
          const previousHits = row.filter((value) => value !== null && previousDrawn.has(value)).length
          const currentHits = previousHits + 1
          if (currentHits === 5) {
            winners.set(player.id, {
              id: player.id,
              name: player.name,
              ticketIndex,
              rowIndex,
            })
          } else if (currentHits === 4) {
            nearAnnouncements.push(`${player.name} sắp KINH ở vé ${ticketIndex + 1}, hàng ${rowIndex + 1}.`)
          }
        })
      })
    }

    if (winners.size) {
      room.finished = true
      room.winners = [...winners.values()]
      const names = room.winners.map((winner) => winner.name).join(', ')
      io.to(room.code).emit('room-announcement', `${names} đã KINH! Trò chơi dừng.`)
    } else if (nearAnnouncements.length) {
      io.to(room.code).emit('room-announcement', nearAnnouncements.join(' '))
    }
    broadcastRoom(room)
  })

  socket.on('reset-room', () => {
    const room = rooms.get(socket.data.roomCode)
    if (!room || room.hostId !== socket.id) return
    room.drawnNumbers = []
    room.finished = false
    room.winners = []
    broadcastRoom(room)
  })

  socket.on('leave-room', () => {
    detachFromRoom(socket)
    socket.emit('room-left')
  })

  socket.on('disconnect', () => detachFromRoom(socket))
})

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Lotto server listening on http://localhost:${port}`)
})