import { createApp } from './app.js'

import { MovieModel } from './models/locale-file-system/movie.js'

createApp({ movieModel: MovieModel })