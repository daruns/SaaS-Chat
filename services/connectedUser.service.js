const db = require('../config/db');
var dbM = require('../config/db.core');

const tbName = "connectedUsers"

async function createJoinUser(connectedUser) {
	return await dbM.insert(tbName, connectedUser);
}

async function findByUser(userId) {
	return await dbM.select(tbName,{userId: userId });
}

async function deleteBySocketId(socketId) {
	return await dbM.deleteRows(tbName,{socketId: socketId})
}

async function deleteAll() {
	await await dbM.deleteRows(tbName,{});
}

module.exports = {
	createJoinUser: createJoinUser,
	findByUser: findByUser,
	deleteBySocketId: deleteBySocketId,
	deleteAll: deleteAll,
}
