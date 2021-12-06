const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);


class RoomUser extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'room_users';
  }
}

module.exports = {
  RoomUser,
};
