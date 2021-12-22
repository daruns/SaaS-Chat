async function authenticate(connectedUser) {
	return await dbM.insert(tbName, connectedUser);
}

module.exports = {
	authenticate,
}
