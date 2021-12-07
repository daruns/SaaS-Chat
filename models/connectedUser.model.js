const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);


class ConnectedUser extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'connected_users';
  }

  static get relationMappings() {
    // Importing models here is one way to avoid require loops.
    const {User} = require('./user.model');

    return {
      user: {
        relation: Model.BelongsToOneRelation,
        // The related model. This can be either a Model
        // subclass constructor or an absolute file path
        // to a module that exports one. We use a model
        // subclass constructor `User` here.
        modelClass: User,
        join: {
          from: 'connected_users.user_id',
          to: 'users.id'
        }
      },
    };
  }
}

module.exports = {
  ConnectedUser,
};
