const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);


class JoinedRoom extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'joined_rooms';
  }

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {User} = require('./user.model');
    const {Room} = require('./room.model');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'joined_rooms.user_id',
          to: 'users.id'
        }
      },

      room: {
        relation: Model.BelongsToOneRelation,
        modelClass: Room,
        join: {
          from: 'joined_rooms.room_id',
          to: 'rooms.id'
        }
      },
    };
  }
}

module.exports = {
  JoinedRoom,
};
