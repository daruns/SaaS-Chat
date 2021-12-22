const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const { RoomUser } = require('./roomUser.model');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);

class Room extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'rooms';
  }

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {User} = require('./user.model');
    const {Message} = require('./message.model');
    const { PendingAction } = require('./pendingAction.model');

    return {
      users: {
        relation: Model.ManyToManyRelation,
        modelClass: User,
        join: {
          from: 'rooms.id',
          through: {
            from: 'room_users.room_id',
            to: 'room_users.user_id'
          },
          to: 'users.id'
        }
      },

      pendingAction: {
        relation: Model.HasManyRelation,
        modelClass: PendingAction,
        join: {
          from: 'rooms.id',
          to: 'room_users_pending_actions.room_id'
        }
      },

      messages: {
        relation: Model.HasManyRelation,
        modelClass: Message,
        join: {
          from: 'rooms.id',
          to: 'messages.room_id'
        }
      },

      lastMessage: {
        relation: Model.HasOneRelation,
        modelClass: Message,
        join: {
          from: 'rooms.id',
          to: 'messages.room_id'
        },
      },
      roomUsers: {
        relation: Model.HasManyRelation,
        modelClass: RoomUser,
        join: {
          from: 'rooms.id',
          to: 'room_users.room_id'
        },
      },
    };
  }
}

module.exports = {
  Room,
};
