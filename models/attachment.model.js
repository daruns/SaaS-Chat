const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);

class Attachment extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'attachments';
  }

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {Message} = require('./message.model');

    return {
      messages: {
        relation: Model.ManyToManyRelation,
        modelClass: Message,
        join: {
          from: 'attachments.id',
          through: {
            from: 'message_attachments.attachment_id',
            to: 'message_attachments.message_id'
          },
          to: 'messages.id'
        }
      },
    };
  }
}

module.exports = {
  Attachment,
};
