import mysql from 'mysql2/promise'
import { pl } from 'zod/locales'

const DEFAULT_CONFIG = {
  host: 'localhost',
  user: 'root',
  port: 3306,
  password: '1234',
  database: 'movies_db'
}
const connectionString = process.env.DATABASE_URL ?? DEFAULT_CONFIG

const connection = await mysql.createConnection(connectionString)

async function Genres_for_movie (id_movie) {
    const [genres_id] = await connection.query(
      `SELECT genre_id FROM movie_genres WHERE movie_id = UUID_TO_BIN(?);`,
      [id_movie]
    )

    if (genres_id.length === 0) {
      return [] // no hay géneros
    }

    const ids = genres_id.map(g => g.genre_id)
    
    const placeholders = genres_id.map(() => '?').join(','); // ?, ?, ?
   
    const [genres] = await connection.query(
      `SELECT name FROM genre WHERE id IN (${placeholders});`,
      ids
    )

    return genres.map(g => g.name)  
}

export class MovieModel {
  static async getAll ({ genre }) {
    if (genre) {
      const lowerCaseGenre = genre.toLowerCase()

      // get genre ids from database table using genre names
      const [genres] = await connection.query(
        'SELECT id, name FROM genre WHERE LOWER(name) = ?;',
        [lowerCaseGenre]
      )
     
      // no genre found
      if (genres.length === 0) return []

      // get the id from the first genre result
      const [{ id }] = genres

      // get all movies ids from database table
      const [movieIds] = await connection.query(
        `SELECT movie_id FROM movie_genres WHERE genre_id = ?;`,
        [id]
      )
      // la query a movie_genres
      const ids = movieIds.map(m => m.movie_id)
      
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(','); // ?, ?, ?
      
      const [movies_filter_genres] = await connection.query(
        `SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(id) id
          FROM movie WHERE id IN (${placeholders});`, ids)
 
      // y devolver resultados..
      const movies_with_genre = await Promise.all(movies_filter_genres.map(async movie => {
        movie.genre = await Genres_for_movie(movie.id)
        return movie
      }))

      return movies_with_genre
    }

    const [movies] = await connection.query(
      'SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(id) id FROM movie;'
    )

    const movies_with_genre = await Promise.all(movies.map(async movie => {
      movie.genre = await Genres_for_movie(movie.id)
      return movie
    }))
  
    return movies_with_genre
  }

  static async getById ({ id }) {
    const [movies] = await connection.query(
      `SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(id) id
        FROM movie WHERE id = UUID_TO_BIN(?);`,
      [id]
    )
    
    const genres_for_movie = await Genres_for_movie(id)

    if (movies.length === 0) return null

    movies[0]['genre'] = genres_for_movie

    return movies[0]  
  }

  static async create ({ input }) {
    const {
      genre, // genre is an array
      title,
      year,
      duration,
      director,
      rate,
      poster
    } = input
    
    // todo: crear la conexión de genre
    const placeholders = genre.map(() => '?').join(',') // ?, ?, ?
    
    // crypto.randomUUID()
    const [uuidResult] = await connection.query('SELECT UUID() uuid;')
    const [{ uuid }] = uuidResult
    const params = [...genre, uuid]
    try {
      await connection.query(
        `INSERT INTO movie (id, title, year, director, duration, poster, rate)
          VALUES (UUID_TO_BIN("${uuid}"), ?, ?, ?, ?, ?, ?);`,
        [title, year, director, duration, poster, rate]
      )
      
      await connection.query(
        `INSERT INTO movie_genres (movie_id, genre_id)
          SELECT movie.id, genre.id FROM movie
          JOIN genre ON genre.name IN (${placeholders})
          WHERE movie.id = UUID_TO_BIN(?); `,
        params
      )

      
    } catch (e) {
      // puede enviarle información sensible
      throw new Error('Error creating movie')
      // enviar la traza a un servicio interno
      // sendLog(e)
    }

    const [movies] = await connection.query(
      `SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(id) id
        FROM movie WHERE id = UUID_TO_BIN(?);`,
      [uuid]
    )
    
    movies[0]['genre'] = genre
    return movies[0]
  }

  static async delete ({ id }) {
    //ejercio fácil: crear el delete
    const [movie_deleted] = await connection.query(
      `DELETE FROM movie WHERE id = UUID_TO_BIN(?);`,
      [id]
    )

    const [genres_deleted] = await connection.query(
      `DELETE FROM movie_genres WHERE movie_id = UUID_TO_BIN(?);`,
      [id]
    )

    if (!(movie_deleted.affectedRows || genres_deleted.affectedRows)) return false

    return true
   
  }

  static async update ({ id, input }) {
    // ejercicio fácil: crear el update
    const {genre, ...rest_input} = input
    
    const [movie] = await connection.query(
      `SELECT title, year, director, duration, poster, rate, BIN_TO_UUID(id) id
        FROM movie WHERE id = UUID_TO_BIN(?);`,
      [id]
    )
    
    const updatedMovie={...movie[0],...rest_input}
    
    const {
      title,
      year,
      duration,
      director,
      rate,
      poster
    } = updatedMovie

    const [movie_updated] = await connection.query(
      `UPDATE movie SET title = ?, year = ?, director = ?, duration = ?, poster = ?, rate= ?
        WHERE id = UUID_TO_BIN(?); `,
      [title, year, director, duration, poster, rate, id]
    )
   
    if (genre) {
      const [genres_deleted] = await connection.query(
        `DELETE FROM movie_genres WHERE movie_id = UUID_TO_BIN(?);`,
        [id]
      )
      
      const placeholders = genre.map(() => '?').join(',')
      const params = [...genre, id]
      const [genres_updated] = await connection.query(
          `INSERT INTO movie_genres (movie_id, genre_id)
            SELECT movie.id, genre.id FROM movie
            JOIN genre ON genre.name IN (${placeholders})
            WHERE movie.id = UUID_TO_BIN(?); `,
          params
      )
    }

    updatedMovie['genre'] = genre
    return updatedMovie
  }
}