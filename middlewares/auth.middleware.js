var {User} = require("../models/user.model");
var cfg = require("../config/config");
const jwt = require('jsonwebtoken')

module.exports = {
    authenticate: async function(token) {
    const verifiedJwt = await jwt.verify(token, cfg.jwtSecret)
    if (!verifiedJwt) {
      const message = err.name === 'TokenExpiredError' ? err.message : 'Unauthorized'
      throw message
    }
    if (!verifiedJwt.id) {
      throw 'UserNotFound'
    }
    let user = await User.query()
    .select('users.id','users.username','users.email','users.name','users.phone_number','users.avatar','users.user_type','users.department','users.reports_to','users.brand_code')
    .findById(verifiedJwt.id);
    if (!user.id) throw 'UserNotFound'
    return user
  }
}
