const { src, dest, parallel, watch, series } = require('gulp');

const autoprefixer = require('autoprefixer');
const babel = require('gulp-babel')
const browserSync = require('browser-sync')
const concat = require('gulp-concat')
const cssnano = require('cssnano');
const del = require('del')
const eslint = require('gulp-eslint')
const fs = require('fs')
const gulpif = require('gulp-if')
const htmlmin = require('gulp-htmlmin')
const imagemin = require('gulp-imagemin')
const merge = require('merge-stream')
const newer = require('gulp-newer')
const path = require('path')
const plumber = require('gulp-plumber')
const pkg = require('./package.json')
const postcss = require('gulp-postcss')
const pug = require('gulp-pug')
const rename = require('gulp-rename')
const sass = require('gulp-sass')
const size = require('gulp-size')
const stylelint = require('gulp-stylelint')
const sourcemaps = require('gulp-sourcemaps')
const svgsprite = require('gulp-svg-sprite')
const uglify = require('gulp-uglify')
const webpack = require("webpack")
const webpackconfig = require("./webpack.config.js")
const webpackstream = require("webpack-stream")

sass.compiler = require('node-sass');
   
// to set environment variable to production uncomment the line below:
// process.env.NODE_ENV = 'production';

const config = {
    devMode: ((process.env.NODE_ENV || 'development').trim().toLowerCase() !== 'production'),
    hot: true, // hot module replacement - set to false if you want to refresh the browser manually
    webpacked: true, // if false all js files will be concatenated instead of webpacked (no need to write app.js)
    checkSizes: false, // if true 'gulp build' will log how much space we have gained with minifying website
    paths: {
        devFolder: './src',
        buildFolder: './dist',
        lintReportsFolder: './reports/lint',
        sass: {
            in: './src/sass/**/*.scss',
            exclude: '!./src/sass/vendor/*.scss',
            out: './dist/css'
        },
        pug: {
            in: './src/pug/*.pug',
            out: './dist/'
        },
        js: {
            in: {
                modules: './src/js/bundle/modules/*.js',
                vendor: './src/js/vendor/*.js*'
            }, 
            out: './dist/js'
        },
        images: {
            in: ['./src/images/**/*.{png,jpg,jpeg,svg}'],
            out: './dist/images'
        },
        fonts: {
            in: './src/fonts/**/*.{woff,woff2}',
            out: './dist/fonts/'
        },
        sprites: {
            folder: './src/icons',
            out: './dist/icons'
        }
    },
    sass: { // config for gulp-sass plugin
        precision: 10,
        // imagePath: './src/images', // will be prepended to image name in sass files
    },
    sprite: { // config for gulp-svg-sprite plugin
        mode: {
            symbol: { // symbol mode to build the SVG
                render: {
                    css: false, // CSS output option for icon sizing
                    scss: false // SCSS output option for icon sizing
                },
            }
        }
    },
    styleLint: { // config for gulp-stylelint plugin
        failAfterError: false,
        reportOutputDir: 'reports/lint',
        reporters: [{ formatter: 'string', save: 'sass-lint-report.txt', console: false }]
    }
}

// log config highlights at the beginning of a task
console.log(
    pkg.name + ' ' + pkg.version + '\n'
    + 'mode: ' + (config.devMode ? 'development' : 'production') + '\n'
    + 'js bundling: ' + (config.webpacked ? 'webpack' : 'concatenation') + '\n'
    + 'browser refresh type: ' + (config.hot ? 'hot module replacement': 'watch')
);

// utils
const getFolders = dir => fs.readdirSync(dir)
	.filter(file => fs.statSync(path.join(dir, file)).isDirectory())

// images
const images = () => src(config.paths.images.in)
    .pipe(newer(config.paths.images.out))
    .pipe(gulpif(config.checkSizes, size({ title: 'before imagemin:' })))
    .pipe(imagemin())
    .pipe(gulpif(config.checkSizes, size({ title: 'after imagemin:' })))
	.pipe(dest(config.paths.images.out));

// icons in sprites
const sprites = done => {
	const folders = getFolders(config.paths.sprites.folder)
    if (folders.length === 0) return done()
    const root = src(path.join(config.paths.sprites.folder, '/*.svg'))
        .pipe(svgsprite(config.sprite))
        .pipe(rename('sprite.svg'))
        .pipe(gulpif(config.checkSizes, size({ title: 'main sprite:' })))
        .pipe(dest(config.paths.sprites.out))
	const tasks = folders
		.map((folder, index) => src(path.join(config.paths.sprites.folder, folder, '/**/*.svg'))
            .pipe(svgsprite(config.sprite))
            .pipe(rename('sprite-' + folder + '.svg'))
            .pipe(gulpif(config.checkSizes, size({ title: 'additional sprite:' })))
			.pipe(dest(config.paths.sprites.out))
    )
	return merge(tasks, root);
}

// fonts
const fonts = () => src(config.paths.fonts.in)
	.pipe(newer(config.paths.fonts.out))
	.pipe(dest(config.paths.fonts.out))
  
// pug
const html = () => src(config.paths.pug.in)
    .pipe(pug())
    .pipe(gulpif(config.checkSizes, size({ title: 'HTML before:' })))
    .pipe(htmlmin({ collapseWhitespace: true }))
    .pipe(gulpif(config.checkSizes, size({ title: 'HTML after:' }))) 
	.pipe(dest(config.paths.pug.out))

// sass
const styles = () => src([config.paths.sass.in, config.paths.sass.exclude])
    .pipe(gulpif(config.devMode, sourcemaps.init()))
    .pipe(stylelint(config.styleLint))
    .pipe(sass((config.sass)).on('error', sass.logError))
    .pipe(gulpif(config.checkSizes, size({ title: 'css before:' })))
    .pipe(postcss([
        autoprefixer({browsers: ['last 1 version']}),
        cssnano()
    ]))
    .pipe(gulpif(config.checkSizes, size({ title: 'css after:' })))
    .pipe(gulpif(config.devMode, sourcemaps.write('.')))
    .pipe(dest(config.paths.sass.out))

// scripts
const js = () => src(config.paths.js.in.modules, { sourcemaps: config.devMode})
    // .pipe(plumber())
    .pipe(gulpif(!config.webpacked, babel({ presets: ['@babel/preset-env'] })))
    .pipe(gulpif(config.webpacked, webpackstream(webpackconfig, webpack)))
    .pipe(src(config.paths.js.in.vendor, { sourcemaps: config.devMode }))
    .pipe(concat('bundle.min.js'))
    .pipe(gulpif(config.checkSizes, size({ title: 'before uglify:' })))
    .pipe(uglify())
    .pipe(gulpif(config.checkSizes, size({ title: 'after uglify:' })))
    .pipe(dest('./dist/js', { sourcemaps: '.'}))

// util for jslint
const eslintResult = (done, exit = false) => result => {
    result.messages.forEach(c => { console.log(c) })
    if (result.messages.length === 0) { console.log('js validated correctly') }
    if (exit) {
        done()
        process.exit(0)
    }
}

// lint scripts
const jslint = done => {
    const bundleFolder = './src/js/bundle'
    const folders = getFolders(bundleFolder)
    if (folders.length === 0) return done()
    
    const root = src(path.join(bundleFolder, '/*.js'))// .pipe(plumber())
        .pipe(eslint())
        .pipe(eslint.result(eslintResult(done)))

	const tasks = folders
		.map((folder, index) => {
            return src(path.join(bundleFolder, folder, '/**/*.js'))// .pipe(plumber())
            .pipe(eslint())
            .pipe(eslint.result(eslintResult(done, /* index === folders.length - 1 */)))
        }
    )

    return merge(tasks, root);
}

// live preview
const serve = () => browserSync({
    server:{ baseDir: config.paths.buildFolder }, 
    port: 3000,
    open: false,
    notify: true
})

// clean dist and lintReport folders
const clean = done => {
    del([
        config.paths.buildFolder + '/*', 
        config.paths.lintReportsFolder + '/*'
    ]).then(paths => { 
        done() 
        process.exit(0)
    })
}

// clean dist/icons folder
const cleanSprites = done => {
    del(['./dist/icons/*.svg']).then(paths => { done() })
}

// reload browser (it will inject new code where possible without reloading)
const reload = done => { 
	browserSync.reload()
	done()
}

// stream browserSync (needs manual website refresh after the change)
const stream = done => { 
	browserSync.stream()
	done()
}

// watch
watch('src/js/bundle/**/*.js', series(js, reload))
watch('src/sass/**/*.scss', series(styles, config.hot ? reload : stream))
watch('src/pug/**/*.pug', series(html, reload))
watch('src/icons/**/*.svg', series(cleanSprites, sprites, reload))

// public tasks
exports.default = series(parallel(images, sprites, fonts, html, styles, js), serve);
exports.build = series(clean, parallel(images, sprites, fonts, html, styles, js));
exports.clean = clean
exports.sprites = sprites
exports.jslint = jslint
