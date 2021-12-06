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
}

module.exports = {
  User,
};
