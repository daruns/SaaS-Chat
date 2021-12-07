'use strict';

const app = require('express')()
const server = require('http').createServer(app);
const WebSocket = require('ws');
const path = require('path');
const request = require("request-promise");

const { ConnectedUser } = require('./models/connectedUser.model');
const { Message } = require('./models/message.model');
const { JoinedRoom } = require('./models/joinedRoom.model');
const { RoomUser } = require('./models/roomUser.model');
const { Room } = require('./models/room.model');
const { User } = require('./models/user.model');

const findMessagesForRoom = async function(roomId) {
return await Message.query().where('room_id', roomId).limit(100)
}

const getRoomByUserId = async function(userId, brandCode) {
	let rooms = await User.query().select().where('brand_code', brandCode).findById(userId)
	.modifiers({
		selectId(builder) {
			builder.select('rooms.id');
			builder.select('name');
		},
		selectUserId(builder) {
			builder.select('users.id');
			builder.select('username');
			builder.select('name');
			builder.select('avatar');
		},
	})
	.withGraphFetched(
		`
		[
			rooms(selectId).[users(selectUserId),messages],
		]
		`
	)

	return rooms
}
const createJoinedRoomService = function(socket_id, user_id, room_id) {
	return JoinedRoom.query.insert({
		socket_id: socket_id,
		user_id: user_id,
		room_id: room_id,
	})
}

const isUsersExist = async function(userIds, brand_code) {
	console.log(userIds)
	let usersFnd = await User.query().select('id').where('brand_code',brand_code).findByIds(userIds)
	if (usersFnd && usersFnd.length === userIds.length) {
		return true
	} else {
		return false
	}
}
ConnectedUser.query().delete().then(() => {})
JoinedRoom.query().delete().then(() => {})

const wss = new WebSocket.Server({
	server: server
});
function s4() {
	return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}

wss.on('connection', function(ws, req) {
	const getUniqueID = (s4() + s4() + '-' + s4())
	// ws.Context = getUniqueID
	var authenticatedUs
	var currentUser = {}

	console.log("client socket id: ", ws._socket._handle.fd);
	console.log("client Uontext: ", ws.Context);
	ws.on('message', async function(message) {
		const parsedMessage = JSON.parse(message)

// authunticate user
		if (parsedMessage.accessToken) {
			authenticatedUs = parsedMessage.accessToken
			console.log(new Date(),"started authentication: ")
			let requestedE = await request({
				url: 'https://onconnect-backend-api.herokuapp.com/api/v1/auth/me',
				headers: {
					'Authorization': 'Bearer ' + authenticatedUs
				},
				rejectUnauthorized: false
			}).catch(err => {
				ws.send(JSON.stringify({body:"unauthorized"}))
				ws.close()
			})
			console.log(new Date(),"finished authentication")
			currentUser = JSON.parse(requestedE)
			ws.Context = currentUser.id
			ConnectedUser.query().insert({brand_code: currentUser.brandCode, socket_id: await ws._socket._handle.fd, user_id: currentUser.id})
			let rooms = await getRoomByUserId(currentUser.id, currentUser.brandCode)

			let resx = JSON.stringify({rooms: rooms})
// send rooms to current client
			ws.send(resx)
		} else {
			if (currentUser.id) {
// recieve new room
				if (parsedMessage.createRoom && parsedMessage.createRoom.users && parsedMessage.createRoom.users.length) {
					let isContiune = false
					let roomUsers = parsedMessage.createRoom.users.filter( i => {return i != currentUser.id} )
					isContiune = (await isUsersExist(roomUsers, currentUser.brandCode))
					if (isContiune) {
						let roomUsersId = roomUsers.map(id=> {return {user_id: id}})
						let roomParams = {
							name: currentUser.username,
							brand_code: currentUser.brandCode,
						}
						let roomUsersWithMy = roomUsersId.concat( {user_id: currentUser.id})
						let insertedRoom = await Room.query().insert(roomParams)
						roomUsersWithMy.forEach(e => {
							insertedRoom.$relatedQuery('users')
							.relate(e.user_id)
							.then(e => console.log(e))
						})
						let rooms = await getRoomByUserId(currentUser.id, currentUser.brandCode)
						let resx = JSON.stringify({rooms: rooms})
// broadcast new added room
						wss.clients.forEach(function each(client) {
							if (roomUsers.concat(currentUser.id) && client.readyState === WebSocket.OPEN) {
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
// receive messages
				} else if (parsedMessage.createMessage && parsedMessage.createMessage.text && parsedMessage.createMessage.room_id) {
					let messageParams = {
						text: parsedMessage.createMessage.text,
						user_id: currentUser.id,
						room_id: parsedMessage.createMessage.room_id,
					}
					let roomUsers = await RoomUser.query().select('user_id').where('room_id',messageParams.room_id)
					console.log(roomUsers);

					let resul = roomUsers.map(e=> e.user_id)
					if (resul.includes(currentUser.id)) {
						let resx = JSON.stringify({messagePerRoom: {text: messageParams.text, room_id: messageParams.room_id, user_id: messageParams.user_id}})
						wss.clients.forEach(function each(client) {
							if (resul.includes(client.Context) && client.readyState === WebSocket.OPEN) {
// broadcast messages
								client.send(resx);
							}
						})
						Message.query().insert(messageParams);
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
				} else if (parsedMessage.joinRoom && parsedMessage.joinRoom.room_id) {
					const messages = await findMessagesForRoom(parsedMessage.joinRoom.room_id); // { limit: 10, page: 1 }
					// Save Connection to Room
					if (messages.length) {

						let resx = JSON.stringify({messagesPerRoom: messages})
						// Send last messages from Room to User
						ws.send(resx);
						createJoinedRoomService(ws._socket._handle.fd, currentUser.id, parsedMessage.joinRoom.room_id);
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
				} else if (parsedMessage.leaveRoom && parsedMessage.leaveRoom.room_id) {
					// remove connection from JoinedRooms
					await deleteBySocketId(ws.client._socket._handle.fd);
				} else {
					ws.send(JSON.stringify({Error: "paramsMissing"}))
				}
			} else {
				ws.send(JSON.stringify({Error: "unauthorized"}))
				ws.close()
			}
		}
	})
}).on('close', function(reasonCode, description) {
	console.log((new Date()) + ' Peer  disconnected.');
});

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname+'/public/index.html'))
})

server.listen(process.env.PORT || 3000, () => console.log(`Lisening on port 3000`))