'use strict';
const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs')
const app = require('express')()
const _ = require('lodash')
var server;
if (process.env.NODE_ENV === "production") {

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
const getRoomByUserId = async function(userId) {
	let rooms = await User.query().select().findById(userId)
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
			builder.select('users.created_at');
		},
		selectMessageParams(builder) {
			builder.select('messages.id');
			builder.select('messages.text');
			builder.select('messages.user_id');
			builder.select('messages.room_id');
			builder.select('messages.created_at');
		},
		selectAttachmentParams(builder) {
			builder.select('attachments.id');
			builder.select('attachments.url');
			builder.select('attachments.content_type');
			builder.select('attachments.size');
			builder.select('attachments.created_at');
		},
		selectMessageRecipientParams(builder) {
			builder.select('message_recipients.created_at');
			builder.select('message_recipients.id');
			builder.select('message_recipients.status');
			builder.select('message_recipients.user_id');
			builder.select('message_recipients.created_at');
		}
	})
	.withGraphFetched(
		`
		[
			rooms(selectId).[
				users(selectUserId),
			],
		]
		`
	)
	console.log("rooooooooooooomss",rooms)

	for (let x = 0; x < rooms.rooms.length;x++) {
		let roomMessage = await Message.query()
		.select('messages.id')
		.select('messages.text')
		.select('messages.user_id')
		.select('messages.room_id')
		.select('messages.created_at')
		.findOne('messages.room_id',rooms.rooms[x].id)
		.orderBy('messages.id',"DESC")
		.modifiers({
			selectUserId(builder) {
				builder.select('users.id');
				builder.select('users.username');
				builder.select('users.name');
				builder.select('users.avatar');
				builder.select('users.created_at');
			},
			selectAttachmentParams(builder) {
				builder.select('attachments.id');
				builder.select('attachments.url');
				builder.select('attachments.content_type');
				builder.select('attachments.size');
				builder.select('attachments.created_at');
			},
			selectMessageRecipientParams(builder) {
				builder.select('message_recipients.created_at');
				builder.select('message_recipients.id');
				builder.select('message_recipients.status');
				builder.select('message_recipients.user_id');
				builder.select('message_recipients.created_at');
			}
		})
		.withGraphFetched(
			`
			[
				attachments(selectAttachmentParams),
				user(selectUserId),
				messageRecipients(selectMessageRecipientParams).[
					user(selectUserId)
				],
			]
			`
		)

	// rooms.rooms = rooms.rooms.map(e => {e['messages'] = [e.lastMessage]; return e})
	rooms.rooms[x].messages = roomMessage ? [roomMessage] : []
	console.log("roooooo--------omss",rooms.rooms[x].messages)
	}
	delete rooms.password ? delete rooms.password : false
	return rooms
}

const getRoomById = async function(roomId) {
	let rooms = await Room.query().select().findById(roomId)
	.modifiers({
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
			users(selectUserId),
			messages(selectMessageParams)
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

const deliverAllUnreadMessagesPerRoom = async function(roomId,userId) {
	return await MessageRecipient.query()
	.select('message_recipients.*')
	.join('messages','message_recipients.message_id','messages.id')
	.whereNot('message_recipients.status','seen')
	.where('messages.room_id',roomId)
	.where('message_recipients.user_id',userId)
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


const getMessagesByRoomId = async function(id) {
	let message = await Message.query()
	.select('messages.id')
	.select('messages.text')
	.select('messages.user_id')
	.select('messages.room_id')
	.select('messages.created_at')
	.where({room_id: id})
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
// MessageRecipient.query().delete().then(() => {console.log("deleted All Message!!")})
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
				let rooms = await getRoomByUserId(currentUser.id)

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
					let roomUsers = _.uniq(parsedMessage.createRoom.users.concat(currentUser.id).map(e => {if ( parseInt(e) ) {return parseInt(e)} else {return 0}} ).filter(e => e!==0))
					console.log("roomusers",roomUsers)
					isContiune = await areUsersExist(roomUsers, currentUser.brand_code)

					if (isContiune && (roomUsers.length === 1)) {
						let userInRoom = await RoomUser.query().findOne('user_id',roomUsers[0])
						console.log("length === 1",userInRoom)
						isContiune = (!userInRoom) ? true : false
					} else if (isContiune && (roomUsers.length === 2)) {
						
					}
					console.log("isContiune",isContiune)
					if (isContiune) {
						let roomUsersId = roomUsers.map(id=> {return {user_id: id}})
						let roomParams = {
							creator_id: currentUser.id,
							name: parsedMessage.createRoom.name ? parsedMessage.createRoom.name : "",
							brand_code: currentUser.brand_code,
						}
						let insertedRoom = await Room.query().insert(roomParams)
						for (let room of roomUsersId) {
							await insertedRoom.$relatedQuery('users').relate(room.user_id)
						}
						let rooms = await getRoomByUserId(currentUser.id)
						let resx = JSON.stringify({rooms: rooms})
// broadcast new added room
						wss.clients.forEach(function each(client) {
							if (roomUsers.includes(client.Context) && client.readyState === WebSocket.OPEN) {
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
						let rooms = await getRoomByUserId(currentUser.id)
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
						let rooms = await getRoomByUserId(currentUser.id)
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
					let roomUsers = await RoomUser.query().where('room_id',messageParams.room_id)
					let resul = roomUsers.map(e=> e.user_id)
					let msgRecipientsParams = {}
					for (let reks of resul) {
						msgRecipientsParams[Number(reks)] = 'not_delivered'
					}
					console.log("resul,currentUser.id",resul,currentUser.id)
					if (resul.includes(currentUser.id)) {
						await Message.query().insert(messageParams)
						.then(async (msg) => {
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
								if (client === ws) {
									msgRecipientsParams[Number(client.Context)] = "seen"
								}
								if (resul.includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
									msgRecipientsParams[Number(client.Context)] = "delivered"
								}
							}
							for (let msrcparam of Object.keys(msgRecipientsParams)) {
								let relatedMsgRecp = await msg.$relatedQuery('messageRecipients').insert({user_id: msrcparam,status: msgRecipientsParams[msrcparam] })
							}
							const messfinal = await getMessageById(msg.id)
							let resx = JSON.stringify({messagePerRoom: {messfinal:messfinal}})
							// let msgsrooms = JSON.stringify(await getRoomById(messfinal.room_id))
							// console.log("room ----------------: ", JSON.parse(msgsrooms) )
							wss.clients.forEach(function each(client) {
								if (resul.includes(client.Context) && client.readyState === WebSocket.OPEN) {
// broadcast messages
									client.send(resx);
								}
							})
						})
						.catch(e => console.log("msg insertion /\\/\\/\\/\\/\\ errOR =-  res: ",e))
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
// receive request messages by room id
				} else if (parsedMessage.getMessagesByRoomId && parsedMessage.getMessagesByRoomId.room_id) {
					const existMyUserInRoom = await RoomUser.query().findOne({user_id: currentUser.id, room_id: parsedMessage.getMessagesByRoomId.room_id})
					const existUsersInRoom = await RoomUser.query().where({room_id: parsedMessage.getMessagesByRoomId.room_id})
					if (existMyUserInRoom) {
						// MessageRecipient.query()
						// .join('messages','message_recipients.message_id', 'messages.id')
						// .join('room_users','messages.room_id','room_users.room_id')
						// .where('messages.room_id',parsedMessage.getMessagesByRoomId.room_id)
						// .where('room_users.user_id',currentUser.id)
						// .where('room_users.user_id',currentUser.id)
						// .where('message_recipients.user_id',currentUser.id)
						// .then(async (room) => {
						// 	console.log("finished delivered -----------------------", parsedMessage.getMessagesByRoomId.room_id,currentUser.id)
						// 	if (room.length) {
						deliverAllUnreadMessagesPerRoom(parsedMessage.getMessagesByRoomId.room_id,currentUser.id)
						.then(async (delivered) => {
						
							console.log("finished delivered -----------------------", delivered)
							const roomMessages = await getMessagesByRoomId(parsedMessage.getMessagesByRoomId.room_id);
							let resx = JSON.stringify({messagesByRoomId: roomMessages})
							if (roomMessages.length) {
								wss.clients.forEach(function each(client) {
									if (existUsersInRoom.map(e=> e.user_id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
// broadcast messages with seen recipients
										client.send(resx);
									}
								})
							} else {
								ws.send(resx)
							}
						})
						// 	}
						// })
//////////
					} else {
						ws.send(JSON.stringify({Error: "NotFount reason is not existMyUserInRoom"}))
					}
// recieve user typing
				} else if (parsedMessage.typing && parsedMessage.typing.room_id) {
					Room.query().findById(parsedMessage.typing.room_id).withGraphFetched({users: true})
					.then((room) => {
						if (room) {
							if (room.users && room.users.map(e => e.id).includes(currentUser.id)) {
								let roomUsers = room.users.map(e => e.id)
								roomUsers = roomUsers.filter(i => { return i !== currentUser.id})
								let resx = JSON.stringify({userTyping: {user_id: currentUser.id,avatar: currentUser.avatar, room_id: room.id}})
								wss.clients.forEach(function each(client) {
									if (roomUsers.includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
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
// remove connection from JoinedRooms
				} else if (parsedMessage.leaveRoom && parsedMessage.leaveRoom.room_id) {
					await deleteBySocketId(await ws.client._socket._handle.fd);
// ping to keep alive
				} else if (parsedMessage.ping) {
					ConnectedUser.query().where({user_id: currentUser.id}).update({updated_at: new Date()})
					.then((res) => {
						ConnectedUser.query().where({brand_code: currentUser.brand_code}).whereRaw('DATE(updated_at) > SUBDATE(CURRENT_DATE, 1)')
						.then((ress) => {

						console.log(ress)
						}).catch(e => {throw e})
					}).catch(e => {throw e})
									
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