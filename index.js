'use strict';
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs')
const app = require('express')()
var server;
if (process.env === "production") {

	server = require('https').createServer({
		cert: fs.readFileSync(process.env.SSL_PATH),
		key: fs.readFileSync(process.env.SSL_PATH)
	});
} else {
	server = require('http').createServer()
}
const WebSocket = require('ws');
const path = require('path');
const {authenticate} = require("./middlewares/auth.middleware");
const { ConnectedUser } = require('./models/connectedUser.model');
const { Message } = require('./models/message.model');
const { JoinedRoom } = require('./models/joinedRoom.model');
const { RoomUser } = require('./models/roomUser.model');
const { Room } = require('./models/room.model');
const { User } = require('./models/user.model');
const { MessageRecipient } = require('./models/messageRecipient.model');

const createJoinedRoomService = function(socket_id, user_id, room_id) {
	return JoinedRoom.query.insert({
		socket_id: socket_id,
		user_id: user_id,
		room_id: room_id,
	})
}

const areUsersExist = async function(userIds, brand_code) {
	let usersFnd = await User.query().select('id').where('brand_code',brand_code).findByIds(userIds)
	if (usersFnd && usersFnd.length === userIds.length) {
		return true
	} else {
		return false
	}
}
const areAllUsersExistInRoom = async function(userIds, roomId) {
	let usersFnd = await RoomUser.query().select('id').where('room_id',roomId).whereIn('user_id', userIds)
	if (usersFnd.length === userIds.length) {
		return true
	} else {
		return false
	}
}

const areUsersExistInRoom = async function(userIds, roomId) {
	let usersFnd = await RoomUser.query().select('id').where('room_id',roomId).whereIn('user_id', userIds)
	if (usersFnd.length) {
		return true
	} else {
		return false
	}
}
const findMessagesForRoom = async function(roomId) {
	return await Message.query().where('room_id', roomId).limit(100)
}
const getRoomByUserId = async function(userId, brandCode) {
	let rooms = await User.query().select().where('brand_code', brandCode).findById(userId)
	.modifiers({
		selectId(builder) {
			builder.select('rooms.id');
			builder.select('rooms.name');
			builder.select('rooms.creator_id');
			builder.select('rooms.created_at');
		},
		selectUserId(builder) {
			builder.select('users.id');
			builder.select('users.username');
			builder.select('users.name');
			builder.select('users.avatar');
		},
		selectMessageParams(builder) {
			builder.select('messages.id');
			builder.select('messages.text');
			builder.select('messages.user_id');
			builder.select('messages.room_id');
			builder.select('messages.created_at');
			builder.limit(1)
		},
		selectAttachmentParams(builder) {
			builder.select('attachments.id');
			builder.select('attachments.url');
			builder.select('attachments.content_type');
			builder.select('attachments.size');
		},
		selectMessageRecipientParams(builder) {
			builder.select('message_recipients.created_at');
			builder.select('message_recipients.id');
			builder.select('message_recipients.status');
			builder.select('message_recipients.user_id');
		}
	})
	.withGraphFetched(
		`
		[
			rooms(selectId).[
				users(selectUserId),
				messages(selectMessageParams).[
					attachments(selectAttachmentParams),
					user(selectUserId),
					messageRecipients(selectMessageRecipientParams).[
						user(selectUserId)
					],
				]
			],
		]
		`
	)
	delete rooms.password ? delete rooms.password : false
	return rooms
}

const deliverAllUnreadMessages = async function(userId) {
	return await MessageRecipient.query()
	.select('message_recipients.*')
	.join('messages','message_recipients.message_id','messages.id')
	.join('room_users','messages.room_id','room_users.room_id')
	.where('message_recipients.status','not_delivered')
	.where('room_users.user_id',userId)
	.whereNot('messages.user_id',userId)
	.where('message_recipients.user_id',userId)
	.update({'message_recipients.status':"delivered"})

}

const deliverAllUnreadMessagesPerRoom = async function(roomId) {
	return await MessageRecipient.query()
	.select('message_recipients.*')
	.join('messages','message_recipients.message_id','messages.id')
	.whereNot('message_recipients.status','seen')
	.where('messages.room_id',roomId)
	.update({'message_recipients.status':"seen"})
}

const getMessageById = async function(id) {
	let message = Message.query()
	.select('messages.id')
	.select('messages.text')
	.select('messages.user_id')
	.select('messages.room_id')
	.select('messages.created_at')
	.findById(id)
	.modifiers({
		selectUserId(builder) {
			builder.select('users.id');
			builder.select('users.username');
			builder.select('users.name');
			builder.select('users.avatar');
		},
		selectAttachmentParams(builder) {
			builder.select('attachments.id');
			builder.select('attachments.url');
			builder.select('attachments.content_type');
			builder.select('attachments.size');
		},
		selectMessageRecipientParams(builder) {
			builder.select('message_recipients.created_at');
			builder.select('message_recipients.id');
			builder.select('message_recipients.status');
			builder.select('message_recipients.user_id');
		},
		selectRoomParams(builder) {
			builder.select('rooms.id');
			builder.select('rooms.name');
			builder.select('rooms.creator_id');
			builder.select('rooms.created_at');

		}
	})
	.withGraphFetched(
		`
		[
			user(selectUserId),
			messageRecipients(selectMessageRecipientParams).[user(selectUserId)],
			attachments(selectAttachmentParams),
			room(selectRoomParams).users(selectUserId),
		]
		`
	)
	if (message) {
		return message
	} else {
		return false
	}
}

ConnectedUser.query().delete().then(() => {console.log("deleted All ConnectedUser!!")})
JoinedRoom.query().delete().then(() => {console.log("deleted All JoinedRoom!!")})
// Message.query().delete().then(() => {console.log("deleted All Message!!")})
// RoomUser.query().delete().then(() => {console.log("deleted All RoomUser!!")})
// Room.query().delete().then(() => {console.log("deleted All Room!!")})

const wss = new WebSocket.Server({
	server: server
});
function s4() {
	return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}

wss.on('connection', function(ws, req) {
	var authenticatedUs
	var currentUser = {}

	console.log("client socket id: ", ws._socket._handle.fd);
	ws.on('message', async function(message) {
		const parsedMessage = JSON.parse(message)
// authunticate user
		if (parsedMessage.accessToken) {
			authenticatedUs = parsedMessage.accessToken
			console.log(new Date(),"started authentication")
			currentUser = await authenticate(authenticatedUs)
			.catch(err => {
				console.log("Error from authenticate accessToken", err)
				ws.send(JSON.stringify({Error: "Unauthorized"}))
				ws.close()
			})
			console.log(new Date(),"finished authentication",currentUser)
			
			if (currentUser) {
				ws.Context = currentUser.id
				deliverAllUnreadMessages(currentUser.id).then(() => {})

				ConnectedUser.query().insert({brand_code: currentUser.brand_code, socket_id: await ws._socket._handle.fd, user_id: currentUser.id}).then(() => {})
				let rooms = await getRoomByUserId(currentUser.id, currentUser.brand_code)

				let resx = JSON.stringify({rooms: rooms})
	// send rooms to current client
				ws.send(resx)
			} else {
				ws.send(JSON.stringify({Error: "Unauthorized"}))
			}
		} else {
			if (currentUser.id) {
// recieve new room
				if (parsedMessage.createRoom && parsedMessage.createRoom.users && parsedMessage.createRoom.users.length) {
					let isContiune = false
					let roomUsers = parsedMessage.createRoom.users.filter( i => {return i != currentUser.id} )
					isContiune = (await areUsersExist(roomUsers, currentUser.brand_code))
					if (isContiune) {
						let roomUsersId = roomUsers.map(id=> {return {user_id: id}})
						let roomUsersNames = (await User.query().select('name').findByIds(roomUsersId)).map(e => e.name).join(', ')
						let roomParams = {
							creator_id: currentUser.id,
							name: parsedMessage.createRoom.name ? parsedMessage.createRoom.name : roomUsersNames,
							brand_code: currentUser.brand_code,
						}
						let roomUsersWithMy = roomUsersId.concat( {user_id: currentUser.id})
						let insertedRoom = await Room.query().insert(roomParams)
						for (let room of roomUsersWithMy) {
							await insertedRoom.$relatedQuery('users').relate(room.user_id)
						}
						let rooms = await getRoomByUserId(currentUser.id, currentUser.brand_code)
						let resx = JSON.stringify({rooms: rooms})
// broadcast new added room
						wss.clients.forEach(function each(client) {
							if (roomUsers.concat(currentUser.id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
//recieve new users for room
				} else if (parsedMessage.addRoomUsers && parsedMessage.addRoomUsers.id && parsedMessage.addRoomUsers.users && parsedMessage.addRoomUsers.users.length) {
					const roomUsers = parsedMessage.addRoomUsers.users.filter( i => {return i != currentUser.id} )
					const isRoomExist = await Room.query().findById(parsedMessage.addRoomUsers.id)
					const existMyUserInRoom = await RoomUser.query().findOne({user_id: currentUser.id, room_id: parsedMessage.addRoomUsers.id})
					const areUsersExistInUsers = (await areUsersExist(roomUsers, currentUser.brand_code))
					const areUsersExistInRoomById = (await areUsersExistInRoom(roomUsers, parsedMessage.addRoomUsers.id))

					if (isRoomExist && existMyUserInRoom && areUsersExistInUsers && !areUsersExistInRoomById) {
						let roomUsersId = roomUsers.map(id=> {return {user_id: id}})
						for (let room of roomUsersId) {
							await isRoomExist.$relatedQuery('users').relate(room.user_id)
						}
						let rooms = await getRoomByUserId(currentUser.id, currentUser.brand_code)
						let resx = JSON.stringify({rooms: rooms})
// broadcast new added users to room
						wss.clients.forEach(function each(client) {
							if (roomUsers.concat(currentUser.id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "somethingWrong: isRoomExist && existMyUserInRoom && !areUsersExistInUsers && !areUsersExistInRoomById"}))
					}
//recieve delete users from room
				} else if (parsedMessage.deleteRoomUsers && parsedMessage.deleteRoomUsers.id && parsedMessage.deleteRoomUsers.users && parsedMessage.deleteRoomUsers.users.length) {
					const roomUsers = parsedMessage.deleteRoomUsers.users;
					const isRoomExist = await Room.query().findById(parsedMessage.deleteRoomUsers.id)
					const existMyUserInRoom = await RoomUser.query().findOne({user_id: currentUser.id, room_id: parsedMessage.deleteRoomUsers.id})
					const areUsersExistInUsers = (await areUsersExist(roomUsers, currentUser.brand_code))
					const areAllUsersExistInRoomById = (await areAllUsersExistInRoom(roomUsers, parsedMessage.deleteRoomUsers.id))
					if (isRoomExist && existMyUserInRoom && areUsersExistInUsers && areAllUsersExistInRoomById) {
						await isRoomExist.$relatedQuery('users')
						.unrelate()
						.whereIn('users.id', roomUsers)
						let rooms = await getRoomByUserId(currentUser.id, currentUser.brand_code)
						let resx = JSON.stringify({rooms: rooms})
// broadcast all rooms without deleted users from room
						wss.clients.forEach(function each(client) {
							if (roomUsers.concat(currentUser.id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "somethingWrong: isRoomExist && existMyUserInRoom && !areUsersExistInUsers && !areAllUsersExistInRoomById"}))
					}
// receive messages
				} else if (parsedMessage.createMessage && parsedMessage.createMessage.text && parsedMessage.createMessage.room_id) {
					let messageParams = {
						text: parsedMessage.createMessage.text,
						user_id: currentUser.id,
						room_id: parsedMessage.createMessage.room_id,
					}
					let roomUsers = await RoomUser.query().select('user_id').where('room_id',messageParams.room_id)
					let resul = roomUsers.map(e=> e.user_id)
					let msgRecipientsParams = {}
					for (let reks of resul) {
						msgRecipientsParams[Number(reks)] = 'not_delivered'
					}
					if (resul.includes(currentUser.id)) {
						Message.query().insert(messageParams).then(async (msg) => {
							if (msg) {
								if (parsedMessage.createMessage.files && typeof parsedMessage.createMessage.files === 'object') {
									for (let fileId of parsedMessage.createMessage.files) {
										console.log(fileId);
										if ((typeof fileId === 'number') && fileId > 0) {
											console.log("msg file related", await msg.$relatedQuery('attachments').relate(fileId))
										}
									}
								}
							}
							// let connusers = await ConnectedUser.query().whereIn('user_id',resul)
							// let joindusers = await JoinedUser.query().where('room_id',msg.room_id).whereIn('user_id',resul)
							for (let client of await wss.clients) {
								if (resul.includes(client.Context) && client.readyState === WebSocket.OPEN) {
									msgRecipientsParams[Number(client.Context)] = "delivered"
								}
							}
							for (let msrcparam of Object.keys(msgRecipientsParams)) {
								msg.$relatedQuery('messageRecipients').insert({user_id: msrcparam,status: msgRecipientsParams[msrcparam] }).then((e)=>{console.log("finished an insert",e)})
							}
							const messfinal = await getMessageById(msg.id)
							let resx = JSON.stringify({messagePerRoom: {messfinal}})
							wss.clients.forEach(function each(client) {
								if (resul.includes(client.Context) && client.readyState === WebSocket.OPEN) {
// broadcast messages
									client.send(resx);
								}
							})
						})

					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
// recieve user typing
				} else if (parsedMessage.typing && parsedMessage.typing.room_id) {
					Room.query().findById(parsedMessage.typing.room_id).withGraphFetched({users: true})
					.then((room) => {
						if (room) {
							console.log("finished first part -----------------------",room)
							if (room.users && room.users.map(e => e.id).includes(currentUser.id)) {
								let roomUsers = room.users.map(e => e.id)
								console.log("finished second part -----------------------",roomUsers)
								roomUsers = roomUsers.filter(i => { return i !== currentUser.id})
								console.log("finished fourth part -----------------------", roomUsers)
								let resx = JSON.stringify({userTyping: {user_id: currentUser.id, room_id: room.id}})
								wss.clients.forEach(function each(client) {
									console.log("finished fifth part -----------------------",client.Context)
									if (roomUsers.includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
									console.log("finished sixth part -----------------------",client._socket._handle.fd)
// broadcast typing
										client.send(resx);
									}
								})
							} else {
								ws.send(JSON.stringify({Error: "RoomNotFound",explain: roomUsers}))
							}
						} else {
							ws.send(JSON.stringify({Error: "RoomNotFound",explain: room}))
						}
					})
					.catch(e => {
						ws.send(JSON.stringify({Error: "RoomNotFound",explain: e}))
					})
// recieve user status changing
				} else if (parsedMessage.seenStatus && parsedMessage.seenStatus.room_id) {
					MessageRecipient.query().join('messages','message_recipients.message_id', 'messages.id').join('room_users','messages.room_id','room_users.room_id').where('messages.room_id',parsedMessage.seenStatus.room_id).where('room_users.user_id',currentUser.id).where('message_recipients.user_id',currentUser.id)
					.then((room) => {
						if (room) {
							console.log("finished fourth part -----------------------", room)
							deliverAllUnreadMessagesPerRoom(parsedMessage.seenStatus.room_id).then((delivered) => {console.log(delivered)})
							let resx = JSON.stringify({seenFromRoom: {user_id:currentUser.id, room_id: parsedMessage.seenStatus.room_id, message_id: room.message_id}})
							wss.clients.forEach(function each(client) {
								if (room.user_id === client.Context && client !== ws && client.readyState === WebSocket.OPEN) {
// broadcast typing
									client.send(resx);
								}
							})
						} else {
							ws.send(JSON.stringify({Error: "RoomNotFound",explain: room}))
						}
					})
					.catch(e => {
						ws.send(JSON.stringify({Error: "RoomNotFound",explain: e}))
					})
// recieve user joined to a room
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
				ws.send(JSON.stringify({Error: "Unauthorized"}))
				ws.close()
			}
		}
	})
	// wss.on('disconnect', function(reasonCode, description) {
	// 	console.log((new Date()) + ' Peer  disconnected.');
	// });
})

// app.get('/', (req, res) => {
// 	res.sendFile(path.join(__dirname+'/public/index.html'))
// })

server.listen(process.env.PORT || 3000, () => console.log(`Lisening on port ${process.env.PORT}`))