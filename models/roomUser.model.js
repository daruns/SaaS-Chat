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
  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {Room} = require('./room.model');

    return {
      room: {
        relation: Model.HasManyRelation,
        modelClass: Room,
        join: {
          from: 'room_users.room_id',
          to: 'rooms.id'
        }
      },
    };
  }
}

module.exports = {
  RoomUser,
};
