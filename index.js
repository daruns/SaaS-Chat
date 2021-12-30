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
const WebSocketServer = require('ws').Server;

const path = require('path');
const {authenticate} = require("./middlewares/auth.middleware");
const { ConnectedUser } = require('./models/connectedUser.model');
const { Message } = require('./models/message.model');
const { JoinedRoom } = require('./models/joinedRoom.model');
const { RoomUser } = require('./models/roomUser.model');
const { Room } = require('./models/room.model');
const { User } = require('./models/user.model');
const { MessageRecipient } = require('./models/messageRecipient.model');
const { RoomPendingAction } = require('./models/roomUsersPendingAction.model');
const Knex = require('knex');
const config = require('./config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
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
			builder.select('rooms.avatar');
			builder.select('rooms.room_type');
			builder.select('rooms.creator_id');
			builder.select('rooms.created_at');
		},
		selectUserId(builder) {
			builder.select('users.id');
			builder.select('users.username');
			builder.select('users.name');
			builder.select('users.avatar');
			builder.select('users.phone_number');
			builder.select('users.email');
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

	for (let x = 0; x < rooms.rooms.length;x++) {
		let roomPendingAction = await RoomPendingAction.query()
		.where({
			room_id: rooms.rooms[x].id,
			stage: "pending",
			action: "addUser"
		})
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
				builder.select('users.email');
				builder.select('users.phone_number');
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
		);
		if (roomMessage && roomMessage.messageRecipients) {
      let foundNd = roomMessage.messageRecipients.find(qt => {return qt.user_id === userId } )
			if (foundNd) {
        await Object.keys(foundNd)
        .forEach(ef => {
          roomMessage['msg_recepeint_' + ef] = foundNd[ef]
        })
      }
		}
		// rooms.rooms = rooms.rooms.map(e => {e['messages'] = [e.lastMessage]; return e})
		rooms.rooms[x].roomPendingAction = roomPendingAction ? [roomPendingAction] : []
		rooms.rooms[x].messages = roomMessage ? [roomMessage] : []
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
			builder.select('users.phone_number');
			builder.select('users.email');
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

const getMessageById = async function(id,userId) {
	let message = await Message.query()
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
			builder.select('users.email');
			builder.select('users.phone_number');
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
			builder.select('rooms.avatar');
			builder.select('rooms.room_type');
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
	if (message && message.messageRecipients) {
    let foundNd = message.messageRecipients.find(qt => {return qt.user_id === userId } )
    if (foundNd) {
      await Object.keys(foundNd)
      .forEach(ef => {
        message['msg_recepeint_' + ef] = foundNd[ef]
      })
    }
	}
  console.log("message, message.messageRecipients: ", message, message.messageRecipients)
  return message
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
			builder.select('users.email');
			builder.select('users.phone_number');
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
			builder.select('rooms.avatar');
			builder.select('rooms.room_type');
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

const findDuplicateUsersInRooms = async function(users,currentUId) {
	return (await knex.raw(`
  select a.room_id, a.user_id
  from room_users a
  where a.room_id in
  (
      select b.room_id
      from room_users b
      where b.room_id in
      (
          select c.room_id
          from room_users c
          join rooms d on (d.id = c.room_id)
          where d.room_type = "chat"
          and c.user_id = ${currentUId}
          group by c.room_id
      )
      and b.user_id in (${users.join(",")})
      group by b.room_id
      having COUNT(b.user_id) = ${users.length}
  )
	;`).catch(err => {console.log("findDuplicateUsersInRooms - Something went wrong in knex raw exec: ", err)}))
}

// ConnectedUser.query().delete().then(() => {console.log("deleted All ConnectedUser!!")})
// JoinedRoom.query().delete().then(() => {console.log("deleted All JoinedRoom!!")})
// RoomPendingAction.query().delete().then(() => {console.log("deleted All RoomPendingAction!!")})
// MessageRecipient.query().delete().then(() => {console.log("deleted All Message!!")})
// Message.query().delete().then(() => {console.log("deleted All Message!!")})
// RoomUser.query().delete().then(() => {console.log("deleted All RoomUser!!")})
// Room.query().delete().then(() => {console.log("deleted All Room!!")})
// RoomPendingAction.query().delete().then(() => {console.log("deleted All pending actions!!")})

const wss = new WebSocketServer({
	server: server
});

function heartbeat() {
  this.isAlive = true;
}

function s4() {
	return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
}

wss.on('connection', function(ws, req) {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
	var authenticatedUs
  const socketId = ws._socket._handle.fd
	var currentUser = {}

	console.log("client socket id: ", socketId);
	ws.on('message', async function(message) {
    const parsedMessage = JSON.parse(message)
    if (!parsedMessage.ping) console.log('received: %s', message);
// authunticate user
		if (parsedMessage.accessToken) {
			authenticatedUs = parsedMessage.accessToken
			currentUser = await authenticate(authenticatedUs)
			.catch(err => {
				console.log("Error from authenticate accessToken", err)
				ws.send(JSON.stringify({Error: "Unauthorized"}))
        ws.close()
			})
			console.log(new Date(),"authenticated: ", currentUser.id)

			if (currentUser) {
				ws.Context = currentUser.id
				// deliverAllUnreadMessages(currentUser.id).then(() => {}).catch(e => console.log("Something went wrong while delivering all messages: ",e))
				let rooms = await getRoomByUserId(currentUser.id)
				.catch(erwr => console.log("something went wrong while fetching rooms: ", erwr))
				console.log(new Date(),"fetched database: ",rooms.rooms ? rooms.rooms.length : rooms)

				let resx = JSON.stringify({rooms: rooms, reqType: 'firstLogin'})
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
					var roomType = false
					let roomUsers = _.uniq(parsedMessage.createRoom.users.concat(currentUser.id).map(e => {if ( parseInt(e) ) {return parseInt(e)} else {return 0}} ).filter(e => e!==0))
					isContiune = await areUsersExist(roomUsers, currentUser.brand_code)
					const withoutCurrentUser = roomUsers.filter(e => {return e !== currentUser.id})
					if (isContiune && withoutCurrentUser.length < 2) {
						roomType = "chat"
						isContiune = false
						let userNewInRoom = withoutCurrentUser.length === 0 ? [currentUser.id] : withoutCurrentUser.concat(currentUser.id)
						const roomUserFndadw = await findDuplicateUsersInRooms(userNewInRoom, currentUser.id)
            const roomUserFnd = roomUserFndadw.length ? roomUserFndadw[0] : []
						.catch(err => {
							ws.send(JSON.stringify({Error: "SomethingWentWrong",err}))
						})
            console.log("newusersinroom: ", userNewInRoom)
            console.log("roomUserFnd:    ",roomUserFnd)
            if (roomUserFnd && roomUserFnd.length) {
							const roomsUsers = _.map(_.groupBy(roomUserFnd,'room_id'), (ee,w) => {return {room_id: parseInt(w),user_id: ee.map(wr => wr.user_id)}  })[0]
							console.log("roomUsers:    ",roomsUsers)
							if ((roomsUsers && roomsUsers.user_id && roomsUsers.user_id.sort().every((value, index) => value === userNewInRoom.sort()[index]) ) ) {
								let resx = JSON.stringify({roomUserFoundedRoomId: {room_id: roomsUsers }, reqType: 'createRoom'} )
								console.log("resss ", resx)
								ws.send(resx)
							} else {
								console.log('else - res[0]: \n')
                isContiune = true
							}
						} else {
              isContiune = true
							console.log('roomUserFnd && roomUserFnd.length: \n', roomUserFnd)
						}
					} else {
            roomType = "channel"
          }
					console.log("isContiune",isContiune)
					if (isContiune) {
						let roomUsersId = roomUsers.map(id=> {return {user_id: id}})
						let roomParams = {
							room_type: roomType ? roomType : "channel",
							creator_id: currentUser.id,
							avatar: parsedMessage.createRoom.avatar ? parsedMessage.createRoom.avatar : "",
							name: parsedMessage.createRoom.name ? parsedMessage.createRoom.name : "",
							brand_code: currentUser.brand_code,
						}
						let insertedRoom = await Room.query().insert(roomParams)
						for (let room of roomUsersId) {
							await insertedRoom.$relatedQuery('users').relate(room.user_id)
						}
						console.log(roomUsers)
						// broadcast new added room
						wss.clients.forEach(async function each(client) {
							let rooms = await getRoomByUserId(currentUser.id)
							let resx = JSON.stringify({rooms: rooms, reqType: 'addRoom'})
							if (roomUsers.includes(client.Context) && client.readyState === WebSocket.OPEN) {
								console.log(client.Context)
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
// recieve edit room
				} else if (parsedMessage.editRoom && parsedMessage.editRoom.id && (parsedMessage.editRoom.avatar || parsedMessage.editRoom.name) ) {
					const amIRoomCreator = await Room.query().where('creator_id',currentUser.id).findById(parsedMessage.editRoom.id).withGraphFetched({users: true})
					if (amIRoomCreator && amIRoomCreator.users) {
						let roomUsersId = amIRoomCreator.users.map(e => e.id)
						let roomParams = {
							avatar: parsedMessage.editRoom.avatar ? parsedMessage.editRoom.avatar : "",
							name: parsedMessage.editRoom.name ? parsedMessage.editRoom.name : ""
						}
						Room.query().where({creator_id: currentUser.id, id: parsedMessage.editRoom.id})
						.update(roomParams)
						.then(async res => {
							if (res) {
								// broadcast edited room
								wss.clients.forEach(async function each(client) {
									let rooms = await getRoomByUserId(client.Context)
									let resx = JSON.stringify({rooms: rooms, reqType: 'editRoom'})
									if (roomUsersId.includes(client.Context) && client.readyState === WebSocket.OPEN) {
										client.send(resx);
									}
								});
							} else {
								ws.send(JSON.stringify({Error: "Couldnt update the room"}))
							}
						})
						.catch(err => {
							ws.send(JSON.stringify({Error: "something went wrong Couldnt update the room"}))
						})
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
//recieve new users for room
				} else if (parsedMessage.addRoomUsers && parsedMessage.addRoomUsers.id && parsedMessage.addRoomUsers.users && parsedMessage.addRoomUsers.users.length) {
					const roomUsers = _.uniq(parsedMessage.addRoomUsers.users.map(e => {if ( parseInt(e) ) {return parseInt(e)} else {return 0}} ).filter(e => e!==0)).filter( i => {return i != currentUser.id} )
					const areUsersExistInUsers = (await areUsersExist(roomUsers, currentUser.brand_code))
					if (areUsersExistInUsers) {
            const existMyUserInRoom = await RoomUser.query().findOne({user_id: currentUser.id, room_id: parsedMessage.addRoomUsers.id})
						const isRoomExist = await Room.query().findById(parsedMessage.addRoomUsers.id)
						.withGraphFetched({roomUsers: true})
						const pureUsers = roomUsers.filter(i => {return !isRoomExist.roomUsers.map(e => e.user_id).includes(i)})
						const areUsersExistInRoomById = (await areUsersExistInRoom(pureUsers, parsedMessage.addRoomUsers.id))
						if (isRoomExist && isRoomExist.room_type && isRoomExist.room_type === 'channel' && existMyUserInRoom && areUsersExistInUsers && !areUsersExistInRoomById) {
              console.log(pureUsers)
							for (let room of pureUsers) {
								if (isRoomExist.creator_id === currentUser.id) {
									await isRoomExist.$relatedQuery('users').relate(room)
									console.log("addeded user: ", isRoomExist,currentUser.id)
								} else {
									if (room !== currentUser.id) {
										let pendingActionParams = {
											user_id: room,
											room_id: isRoomExist.id,
											from_user_id: currentUser.id,
											stage: 'pending',
											action: "addUser",
										}
                    console.log("pendingActionParams", pendingActionParams)
										const roomPendingAction = await RoomPendingAction.query().findOne(pendingActionParams)
										if (!roomPendingAction) {
											console.log("added pending: ", roomPendingAction)
											await RoomPendingAction.query().insert(pendingActionParams)
										} else {
											console.log("add user already exist: ", roomPendingAction)
										}
									}
								}
							}
							// broadcast new added users to room
							wss.clients.forEach(async function each(client) {
								let rooms = await getRoomByUserId(client.Context)
								let resx = JSON.stringify({rooms: rooms, reqType: 'addUserToRoom'})
								if (roomUsers.concat(currentUser.id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
									client.send(resx);
								}
							});
						} else {
							ws.send(JSON.stringify({Error: "somethingWrong: isRoomExist && existMyUserInRoom && !areUsersExistInRoomById"}))
						}
					} else {
						ws.send(JSON.stringify({Error: "somethingWrong: !areUsersExistInUsers"}))
					}
//recieve confirm pending users for room
				} else if (parsedMessage.confirmPendingUser && parsedMessage.confirmPendingUser.room_id && parsedMessage.confirmPendingUser.user_id) {
					const roomPendingAction = await RoomPendingAction.query().findOne({
						room_id: parsedMessage.confirmPendingUser.room_id,
						user_id: parsedMessage.confirmPendingUser.user_id,
						action: 'addUser',
						stage: 'pending'
					})
					const isRoomExist = await Room.query().findOne({room_type: 'channel',room_id: parsedMessage.confirmPendingUser.room_id, creator_id: currentUser.id})
					if (roomPendingAction && isRoomExist && isRoomExist.creator_id === currentUser.id) {
						await await RoomPendingAction.query().findById(roomPendingAction.id).update({
							user_id: parsedMessage.confirmPendingUser.user_id,
							room_id: isRoomExist.id ,
							stage: "confirmed",
						})
						await isRoomExist.$relatedQuery('users').relate(parsedMessage.confirmPendingUser.user_id)
						// broadcast confirm pending users for room
						wss.clients.forEach(async function each(client) {
							let rooms = await getRoomByUserId(client.Context)
							let resx = JSON.stringify({rooms: rooms, reqType: 'addUserToRoom'})
							if (roomUsers.concat(currentUser.id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "somethingWrong: !roomPendingAction"}))
					}
//recieve decline pending users for room
				} else if (parsedMessage.declinePendingUser && parsedMessage.declinePendingUser.room_id && parsedMessage.declinePendingUser.user_id) {
					const roomPendingAction = await RoomPendingAction.query().findOne({
						room_id: parsedMessage.declinePendingUser.room_id,
						user_id: parsedMessage.declinePendingUser.user_id,
						action: 'addUser',
						stage: 'pending'
					})
					const isRoomExist = await Room.query().findOne({room_type: 'channel',room_id: parsedMessage.declinePendingUser.room_id, creator_id: currentUser.id})
					if (roomPendingAction && isRoomExist && isRoomExist.creator_id === currentUser.id) {
						await RoomPendingAction.query().findById(roomPendingAction.id).update({
							user_id: parsedMessage.declinePendingUser.user_id,
							room_id: isRoomExist.id ,
							stage: "declined",
						})
						// broadcast decline pending users for room
						wss.clients.forEach(async function each(client) {
							let rooms = await getRoomByUserId(client.Context)
							let resx = JSON.stringify({rooms: rooms, reqType: 'addUserToRoom'})
							if (roomUsers.concat(currentUser.id).includes(client.Context) && client.readyState === WebSocket.OPEN) {
								client.send(resx);
							}
						});
					} else {
						ws.send(JSON.stringify({Error: "somethingWrong: !roomPendingAction"}))
					}
//recieve delete users from room
				} else if (parsedMessage.deleteRoomUsers && parsedMessage.deleteRoomUsers.id && parsedMessage.deleteRoomUsers.users && parsedMessage.deleteRoomUsers.users.length) {
          const roomUsers = _.uniq(parsedMessage.deleteRoomUsers.users.map(e => {if ( parseInt(e) ) {return parseInt(e)} else {return 0}} ).filter(e => e!==0)).filter(function( element ) {return element !== undefined});
					const isRoomExist = await Room.query().findById(parsedMessage.deleteRoomUsers.id).withGraphFetched({users: true,messages: true})
					const existMyUserInRoom = await RoomUser.query().findOne({user_id: currentUser.id, room_id: parsedMessage.deleteRoomUsers.id})
					const areUsersExistInUsers = (await areUsersExist(roomUsers, currentUser.brand_code))
					const areAllUsersExistInRoomById = (await areAllUsersExistInRoom(roomUsers, parsedMessage.deleteRoomUsers.id))
					if (isRoomExist && existMyUserInRoom && areUsersExistInUsers && areAllUsersExistInRoomById) {
						let usersFromRoomOld = isRoomExist.users
						if (isRoomExist.room_type === "channel") {
							if (isRoomExist.creator_id !== currentUser.id) {

								if (roomUsers.length === 1 && roomUsers[0] === currentUser.id) {
									await isRoomExist.$relatedQuery('users')
									.unrelate()
									.where('users.id', currentUser.id)
								} else {
									ws.send(JSON.stringify({Error: "room is not blong to you"}))
								}
							} else {
								await isRoomExist.$relatedQuery('users')
								.unrelate()
								.whereIn('users.id', roomUsers)
							}
						}

						if (isRoomExist.room_type === "chat") {
							if (roomUsers.length === 1 && roomUsers[0] === currentUser.id) {
                if (isRoomExist.messages && isRoomExist.messages.length === 0) {
                  await isRoomExist.$query().delete()
                }
                if ( isRoomExist.users.length === 2 ) {
                  isRoomExist.length
                }
								await isRoomExist.$relatedQuery('users')
								.unrelate()
								.where('users.id', currentUser.id)
							}
						}

						if (roomUsers.length === 1 && isRoomExist.users.length === 1 && isRoomExist.users[0].id === currentUser.id) {
							await isRoomExist.$query().delete()
						}
						let rooms, resx;
						// broadcast all rooms without deleted users from room
						wss.clients.forEach(async function each(client) {
							if (usersFromRoomOld.map(e => {return parseInt(e.id)} ).includes(client.Context) && client.readyState === WebSocket.OPEN) {
								rooms = await getRoomByUserId(client.Context)
								resx = JSON.stringify({rooms: rooms, reqType: 'deleteUserFromRoom'})
								console.log("deleted room: ",resx)
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
					console.log("resul,currentUser.id",resul,currentUser.id,resul.includes(currentUser.id))
					if (resul.includes(currentUser.id)) {
						Message.query().insert(messageParams)
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
              console.log("msg: ",msg)
							await wss.clients.forEach(async client => {
								if (client === ws) {
									msgRecipientsParams[Number(client.Context)] = "seen"
                }
								if (resul.includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
									msgRecipientsParams[Number(client.Context)] = "delivered"
								}
							})
							await Object.keys(msgRecipientsParams).forEach(async msrcparam => {
								msg.$relatedQuery('messageRecipients').insert({user_id: msrcparam,status: msgRecipientsParams[msrcparam] }).then((resss) => {console.log("messageRecipients: ",resss)})
							})
							const messfinal = await getMessageById(msg.id, currentUser.id)
              console.log(messfinal)
							let resx = JSON.stringify({messagePerRoom: {messfinal:messfinal}, reqType: 'createMessage'})
							await wss.clients.forEach(async function (client) {
                console.log("resul && client.Context ",client.Context)
                if (resul.includes(client.Context) && client.readyState === WebSocket.OPEN) {
                  console.log("resul.includes(client.Context): ",resul.includes(client.Context))
// broadcast messages
									client.send(resx);
								}
							})
						})
						.catch(e => console.log("msg insertion errOR =-  res: ",e))
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
// receive request messages by room id
				} else if (parsedMessage.getMessagesByRoomId && parsedMessage.getMessagesByRoomId.room_id) {
					console.log(parsedMessage.getMessagesByRoomId.room_id)
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
							let resx = JSON.stringify({messagesByRoomId: {room_id: parsedMessage.getMessagesByRoomId.room_id , roomMessages }, reqType: 'getMessagesByRoomId' } )
							if (roomMessages.length) {
								wss.clients.forEach(async function each(client) {
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
								let resx = JSON.stringify({userTyping: {user_id: currentUser.id,avatar: currentUser.avatar, room_id: room.id}, reqType: 'typing'})
								wss.clients.forEach(async function each(client) {
									if (roomUsers.includes(client.Context) && client !== ws && client.readyState === WebSocket.OPEN) {
// broadcast typing
										client.send(resx);
									}
								})
							} else {
								ws.send(JSON.stringify({Error: "RoomNotFound",explain: room.users}))
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

						let resx = JSON.stringify({messagesPerRoom: messages, reqType: 'joinRoom'})
						// Send last messages from Room to User
						ws.send(resx);
						createJoinedRoomService(socketId, currentUser.id, parsedMessage.joinRoom.room_id);
					} else {
						ws.send(JSON.stringify({Error: "NotFount"}))
					}
// remove connection from JoinedRooms
				} else if (parsedMessage.leaveRoom && parsedMessage.leaveRoom.room_id) {
					await deleteBySocketId(await ws.client._socket._handle.fd);
// ping to keep alive
				} else if (parsedMessage.ping) {
					User.query()
					.select('id')
					.select('avatar')
					.select('name')
					.select('username')
					.select('email')
					.select('phone_number')
					.where({brand_code: currentUser.brand_code}).then((res) => {
						let clients = []
						let resIds = res.map(e => parseInt(e.id))

						for (let client of wss.clients) {
							if (client.readyState === WebSocket.OPEN && resIds.includes(parseInt(client.Context)) && !clients.find(e => {return e.id === client.Context}) ) {
								clients.push(res.find(e => { return e.id === client.Context }) )
							}
						}
						clients = clients.filter(function( element ) {return element !== undefined});
						let resx = JSON.stringify({onlineUsers: clients, reqType: 'ping'})
						for (let client of wss.clients) {
							if (client.readyState === WebSocket.OPEN && resIds.includes(parseInt(client.Context)) ) {
								client.send(resx)
							}
						}
					})
				} else {
					ws.send(JSON.stringify({Error: "paramsMissing"}))
				}
			} else {
				ws.send(JSON.stringify({Error: "Unauthorized"}))
				ws.close()
			}
		}
	})
})

// const interval = setInterval(function ping() {
//   wss.clients.forEach(function each(ws) {
//     if (ws.isAlive === false) return ws.terminate();
//     const socketId = ws._socket._handle.fd
//     ws.isAlive = false;
//     console.log("socketInterval: ", ws.Context, socketId)
//     ws.ping();
//   });
// }, 5000);

// wss.on('close', function close() {
//   clearInterval(interval);
// });

// app.get('/', (req, res) => {
// 	res.sendFile(path.join(__dirname+'/public/index.html'))
// })

server.listen(process.env.PORT || 3000, () => console.log(`Lisening on port ${process.env.PORT}`))