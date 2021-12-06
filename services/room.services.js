var dbM = require('../config/db.core');

const tbName = "rooms"
const rommUsersTbName = "rommUsers"
	async function createRoom(room, creator) {
    await addCreatorToRoom(room, creator);
    return await dbM.insert(tbName, room);
  }

	async function getRoom(roomId) {
    return  dbM.select(tbName,{id:roomId})
    // .withGraphFetched({
    //   user: {}
    // });
  }

	async function getRoomsForUser(userId) {
    return await dbM.select(tbName,{userId: userId })
  }

	async function addCreatorToRoom(room, creator) {
		return await dbM.insert(rommUsersTbName, {roomId: room.id, userId: creator.id});
  }
module.exports = {
	createRoom: createRoom,
	getRoom: getRoom,
	getRoomsForUser: getRoomsForUser,
	addCreatorToRoom: addCreatorToRoom,
}
