var dbM = require('../config/db.core');

const tbName = "messages"
async function create(message) {
	return await db.insert(tbName,message);
}

async function findMessagesForRoom(room) {
	const query = await db.select(tbName, {roomId: room.id})
		.withGraphFetched({user: true})
	return query;
}
module.exports = {
	create: create,
	findMessagesForRoom: findMessagesForRoom,
}
