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

const getRoomUsers = async function(roomId) {
	return await User.query()
	.select('users.username as username','users.name as name', 'room_users.user_id as id')
	.join('room_users', 'users.id', 'room_users.user_id')
	.where('room_users.room_id', roomId)
}

const isUserExist = async function(userId) {
	if (await User.query().select('id').findById(userId)) {
		return true
	} else {
		return false
	}
}

const wss = new WebSocket.Server({
	server: server
});
function s4() {
	return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}

wss.on('connection', async function(ws, req) {
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
			currentUser = JSON.parse(requestedE)
			ws.Context = currentUser.id
			let insertedSs = await ConnectedUser.query().insert({brand_code: currentUser.brandCode, socket_id: ws._socket._handle.fd, user_id: currentUser.id})
			RoomUser.query()
			.select('room_users.room_id')
			.where('user_id', currentUser.id)

			.then((res) => {
				let resul = res

				resul = resul.map(e => {return e.room_id})

				return Room.query()
				.whereIn('id',resul)
			})

			.then(async (room) => {
				let rooms = []

				for (let e of room) {
					e["users"] = await getRoomUsers(e.id)
					rooms.push(e)
				}

				let resx = JSON.stringify({rooms: rooms})
// send rooms to current client
				ws.send(resx);
			})
		} else {
			if (currentUser.id) {
// recieve new room
				if (parsedMessage.createRoom && parsedMessage.createRoom.users) {
					let isContiune = false
					let roomUsers = parsedMessage.createRoom.users
					for (let userId of roomUsers) {
						if ((await isUserExist(userId)) && userId != currentUser.id) {
							isContiune = true
						}
					}
					console.log("is continue", await isUserExist(currentUser.id))
					if (isContiune) {
						let roomParams = {
							name: currentUser.username,
							brand_code: currentUser.brandCode,
						}
						Room.query()
						.insert(roomParams)
						.then(async(res) => {
							console.log(res)
								let roomUser = await RoomUser.query()
								.insert({
									room_id: res.id,
									user_id: currentUser.id,
								})
								return {createdRoom: res, creatorRoomUser: roomUser}
						})
						.then(async(res) => {
							if (res) {
								// res === {
								// 	createdRoom: Room { name: 'devtest', brand_code: undefined, id: 35 },
								// 	creatorRoomUser: RoomUser { room_id: 35, user_id: 1, id: 5 }
								// }
								res['roomUsers'] =[res.creatorRoomUser]
								let roomUsers = parsedMessage.createRoom.users
								for (let userId of roomUsers) {
									res['roomUsers'].push(
										await RoomUser.query().insert({
											room_id: res.createdRoom.id,
											user_id: userId,
										})
									)
								}
								console.log("result of rooms : ---------",res)
								let resx = JSON.stringify({newRooms: res})
// broadcast new added room
								ws.send(resx)
								wss.clients.forEach(function each(client) {
									console.log("result of clientContext : ---------",client.Context, client._socket._handle.fd)
									console.log("result  : ---------",res['roomUsers'])
									if (res['roomUsers'].map(e => { return e.user_id}).includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
										client.send(resx);
									}
								});
							}
						})
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
// ####### TODO: if the user not included in rooms by the room_id that received dont send message 
					Message.query()
					.insert(messageParams)
					RoomUser.query().where('id',messageParams.room_id)
					.then((res => {
						let resul = res.map(e=> e.user_id)
						if (resul.includes(currentUser.id)) {

							let resx = JSON.stringify({messagePerRoom: {text: messageParams.text, room_id: messageParams.room_id, user_id: messageParams.user_id}})
							wss.clients.forEach(function each(client) {
								if (resul.includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
// broadcast messages
									client.send(resx);
								}
							})
						} else {
							ws.send(JSON.stringify({Error: "NotFount"}))
						}
					}))
				} else {
					ws.send(JSON.stringify({Error: "paramsMissing"}))
				}
			} else {
				ws.send(JSON.stringify({Error: "unauthorized"}))
				ws.close()
			}
		}
	})
});

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname+'/public/index.html'))
})

server.listen(process.env.PORT || 4000, () => console.log(`Lisening on port 3000`))