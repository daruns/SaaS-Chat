const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);


class MessageRecipient extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'message_recipients';
  }

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {User} = require('./user.model');
    const {Message} = require('./message.model');

    return {
      message: {
        relation: Model.BelongsToOneRelation,
        modelClass: Message,
        join: {
          from: 'message_recipients.message_id',
          to: 'messages.id'
        }
      },
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'message_recipients.user_id',
          to: 'users.id'
        }
      },
    };
  }
}

module.exports = {
  MessageRecipient,
};
