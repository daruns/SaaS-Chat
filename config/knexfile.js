// Update with your config settings.
module.exports = {
  development: {
    client: 'mysql',
    connection: {
      host: 'oneconnect.it',
      database: 'oneconne_test_datahub',
      user: 'oneconne_oneconnectit2021',
      password: 'iU#FgpEvu,uF6;K].y',
      charset: 'utf8',
    },
    migrations: {
      directory: __dirname + '/knex/migrations',
    },
    seeds: {
      directory: __dirname + '/knex/seeds'
    }
  },

  production: {
    client: 'postgresql',
    connection: {
      database: 'my_db',
      user:     'username',
      password: 'password'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  }

}