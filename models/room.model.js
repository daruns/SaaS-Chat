const { Model } = require('objection');
const Knex = require('knex');
const config = require('../config/knexfile');
const isProd = process.env.NODE_ENV === 'production';
const connection = isProd ? config.production : config.development;
const knex = Knex(connection);
Model.knex(knex);

class Room extends Model {
  // Table name is the only required property.
  static get tableName() {
    return 'rooms';
  }

  // static get relationMappings() {
  //   return {
  //     relation: Model.ManyToManyRelation,
  //     modelClass: require(''),
  //     join: {
  //       from: 'rooms.id',
  //       through: {
  //         from: 'room_users.actorId',
  //         to: 'room_users.movieId',
  //         extra: ['characterName']
  //       },
  //       to: 'movies.id'
  //     }
  //   };
  // }
}

module.exports = {
  Room,
};
