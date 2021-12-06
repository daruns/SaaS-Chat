var dbM = require('../config/db.core');

const tbName = "joinedRooms"
async function create(joinedRoom) { 
	return await dbM.insert(tbName ,joinedRoom);
}

async function findByUser(user) {
	return await dbM.select(tbName,{userId: user});
}

async function findByRoom(room) {
	return await dbM.select(tbName,{ roomId: room });
}

async function deleteBySocketId(socketId) {
	return await dbM.deleteRows(tbName,{socketId: socketId})
}

async function deleteAll() {
	await await dbM.deleteRows(tbName,{});
}

module.exports = {
	create: create,
	findByUser: findByUser,
	findByRoom: findByRoom,
	deleteBySocketId: deleteBySocketId,
	deleteAll: deleteAll,
}
