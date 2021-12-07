const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);


class User extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'users';
  }

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {Room} = require('./room.model');

    return {
      rooms: {
        relation: Model.ManyToManyRelation,
        modelClass: Room,
        join: {
          from: 'users.id',
          through: {
            from: 'room_users.user_id',
            to: 'room_users.room_id'
          },
          to: 'rooms.id'
        }
      },
    };
  }
}

module.exports = {
  User,
};
