const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);

class PendingAction extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'room_users_pending_actions';
  }
	// roomId: number
	// userId: number
	// fromUserId: number
	// stage: string
	// action: string

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {User} = require('./user.model');
    const {Room} = require('./room.model');

    return {
      fromUser: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'room_users_pending_actions.from_user_d',
          to: 'users.id'
        }
      },

			user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'room_users_pending_actions.user_id',
          to: 'users.id'
        }
      },

      room: {
        relation: Model.BelongsToOneRelation,
        modelClass: Room,
        join: {
          from: 'room_users_pending_actions.room_id',
          to: 'rooms.id'
        }
      },
    };
  }
}

module.exports = {
  PendingAction,
};
