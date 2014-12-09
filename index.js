'use strict';
var gulp;
var pkg;
var browserSync = require('browser-sync');
var plugins = {
    autoprefixer: require('gulp-autoprefixer'),
    awsS3 : require('gulp-aws-s3'),
    bower : require('gulp-bower'),
    concat : require('gulp-concat'),
    ghPages : require('gulp-gh-pages'),
    replace : require('gulp-replace'),
    run : require('gulp-run'),
    sass : require('gulp-sass'),
    del : require('del'),
    minimist : require('minimist'),
    'if' : require('gulp-if'),
    bump : require('gulp-bump'),
    rename : require("gulp-rename"),
    uglify : require('gulp-uglify'),
    semver : require('semver'),
    flatten : require('gulp-flatten')
};
var paths = require('./paths');
var knownOptions = {
    string: 'version',
    default: { version: 'patch' }
};
var options = plugins.minimist(process.argv.slice(2), knownOptions);

function copyDir(location, fileType){
    var files = (fileType === 'css') ? '/' + pkg.name + '.css' : '/**/*';
    return gulp.src([paths[location][fileType] + files])
        .pipe(gulp.dest(paths.dist[fileType]));
}

function awsUpload(fileType, awsS3){
    var path = 'components/' + pkg.name + '/' + pkg.version + '/' + fileType + '/';
    return gulp.src(paths.dist[fileType] + '/**/*')
        .pipe(awsS3.upload({ path: path } ));
}

function updateDocs(files){
    var now = Date().split(' ').splice(0,5).join(' ');
    return gulp.src(files, { base : './' })
        .pipe(plugins.replace(/[0-9]+\.[0-9]+\.[0-9]/g, pkg.version))
        .pipe(plugins.replace(/{{ site.version }}/g, pkg.version))
        .pipe(plugins.replace(/{{ site.time }}/g, now))
        .pipe(gulp.dest('./'));
}


function initBower(cb){
    if (pkg.repository.url.indexOf('/skyglobal/')>0){
        return plugins.run('bower register bskyb-' + pkg.name + ' ' + pkg.repository.url).exec('', cb);
    } else {
        console.log('**Bower skipped as its not a SkyGlobal Repo**');
        return cb();
    }
}

function initGHPages(cb){
    return plugins.run(
            '\n' +'git checkout --orphan gh-pages;' +
            '\n' +'git rm -rf .;' +
            '\n' +'touch README.md;' +
            '\n' +'git add README.md;' +
            '\n' +'git commit -m "Init gh-pages";' +
            '\n' +'git push --set-upstream origin gh-pages;' +
            '\n' +'git checkout master;' +
            '\n').exec('', cb);
}

function gulpTasks(globalGulp, globalPkg){
    gulp = globalGulp;
    pkg = globalPkg;

    var runSequence = require('run-sequence').use(gulp);


    gulp.task('pre-build', function(cb){
        return cb();
    });

    gulp.task('sass', function() {
        browserSync.notify('<span style="color: grey">Running:</span> Sass compiling');
        return gulp.src([
                paths.source['sass'] + '/**/*.scss',
                paths.demo['sass'] + '/**/*.scss',
                paths.site['sass'] + '/**/*.scss'])
            .pipe(plugins.sass({
                includePaths: ['bower_components'],
                outputStyle: 'nested'
            }))
            .pipe(plugins.autoprefixer())
            .pipe(gulp.dest(paths.site['css']))
            .pipe(browserSync.reload({stream:true}));
    });

    gulp.task('js-min', function() {
        return gulp.src(paths.source['js'] + '/**/*')
            .pipe(plugins.concat(pkg.name + '.min.js'))
            .pipe(plugins.uglify())
            .pipe(gulp.dest(paths.site['js']));
    });

    gulp.task('js-dev', function() {
        return gulp.src(paths.source['js'] + '/**/*')
            .pipe(plugins.concat(pkg.name + '.js'))
            .pipe(gulp.dest(paths.site['js']));
    });

    gulp.task('js', function(cb) {
        return runSequence(['js-dev','js-min'],
            cb
        );
    });

    gulp.task('browserSync', function() {
        browserSync({
            port: 3456,
            server: {
                baseDir: paths.site['root']
            }
        });
    });

    gulp.task('watch', function() {
        gulp.watch([paths.site['root'], paths.demo['root']], ['create-site']);
        gulp.watch([paths.source['sass'] + '/**/*',paths.demo['sass']], ['sass']);
    });


//    create the _ste directories ready for demo
    gulp.task('create-site-html', function createSite() {
        return gulp.src([paths.demo['root'] + '/index.html',
                paths.demo['root'] +'/_includes/*.html'])
            .pipe(plugins.concat('index.html'))
            .pipe(gulp.dest(paths.site['root']));
    });

    gulp.task('create-site-images', function createSite() {
        return gulp.src(paths.demo['images'] + '/**/*')
            .pipe(gulp.dest(paths.site['images']));
    });

    gulp.task('create-site-fonts', function createSite() {
        return gulp.src([
                paths.source['fonts'] + '/**/*',
                paths.bower['fonts'] + '/**/*.{eot,ttf,woff,svg}'
        ])
            .pipe(plugins.flatten())
            .pipe(gulp.dest(paths.site['fonts']));
    });
    gulp.task('create-site', function createSite() {
        return runSequence(['create-site-html', 'create-site-images', 'create-site-fonts']);
    });

    gulp.task('build', function(cb) {
        return runSequence('clean', 'pre-build', ['create-site','bower'], ['update-docs-version', 'sass', 'js'],'create-bower-dist',
            cb
        );
    });

//remove temporary directors
    gulp.task('clean', function(cb) {
        return plugins.del([
            '.tmp',
            paths.site['root'],
            paths.dist['root']
        ], cb);
    });

//update the version number used within all documentation and html
    gulp.task('update-docs-version-within-md', function(){
        return updateDocs(['README.md']);
    });
    gulp.task('update-docs-version-within-site', function(){
        return updateDocs([paths.site['root'] + '/**/*.html']);
    });
    gulp.task('update-docs-version', function(cb){
        return runSequence(['update-docs-version-within-site', 'update-docs-version-within-md'],cb);
    });
    gulp.task('bump-version', function(cb){
        pkg.version = plugins.semver.inc(pkg.version, options.version);
        return gulp.src('./*.json')
            .pipe(plugins.bump({type: options.version}))
            .pipe(gulp.dest('./'));
    });

    /*
     * Initialising the component
     */
    gulp.task('copy-structure', function(cb) {
        return gulp.src(__dirname + '/component-structure/**/*')
            .pipe(plugins.replace(/{{ component }}/g, pkg.name))
            .pipe(gulp.dest('./'));
    });
    gulp.task('name-component', function(cb) {
        return gulp.src('./package.json', { base : './' })
            .pipe(plugins.replace(/{{ component }}/g, pkg.name))
            .pipe(gulp.dest('./'));
    });
    gulp.task('rename-js', function(cb) {
        return gulp.src(['./src/js/main.js'], { base : './' })
            .pipe(plugins.rename(pkg.name + '.js'))
            .pipe(gulp.dest('./src/js/'));
    });
    gulp.task('rename-scss', function(cb) {
        return gulp.src(['./src/scss/main.scss'], { base : './' })
            .pipe(plugins.rename(pkg.name + '.scss'))
            .pipe(gulp.dest('./src/scss/'));
    });
    gulp.task('rename-dot-gitignore', function(cb) {
        return gulp.src('./dot.gitignore', { base : './' })
            .pipe(plugins.rename('.gitignore'))
            .pipe(gulp.dest('./'));
    });
    gulp.task('remove-renamed-files', function(cb) {
        return plugins.del(
            ['./dot.gitignore', './src/js/main.js', './src/scss/main.scss' ],
            cb);
    });
    gulp.task('initGHPages', function(cb) {
        return initGHPages(cb);
    });
    gulp.task('initBower', function(cb) {
        return initBower(cb);
    });

    gulp.task('git-commit-push', function(cb){
        return plugins.run(
                'git commit -am "Version bump for release";' +
                'git push origin master').exec('', cb);
    });

    /*
     * RELEASING
     */

//  RELEASING:  Bower tasks
    gulp.task('create-bower-dist', function() {
        copyDir('site', 'js');
        copyDir('site', 'css');
        copyDir('site', 'sass');
        copyDir('site', 'fonts');
        copyDir('source', 'fonts');
        return copyDir('source', 'sass');
    });

    gulp.task('release:bower', function(cb) {
        return plugins.run(
                'git tag -a v'+ pkg.version +' -m "release v' + pkg.version +' for bower"; ' +
                'git push origin master v'+ pkg.version
        ).exec('', cb);
    });

    gulp.task('bower', function() {
        return plugins.bower()
    });

//  RELEASING:  GH Pages
    gulp.task('release:gh-pages', function () {
        gulp.src(paths.site['root'] + "/**/*")
            .pipe(plugins.ghPages({
                cacheDir: '.tmp'
            })).pipe(gulp.dest('/tmp/gh-pages'));
    });

//  RELEASING:  Amazon Web Services
    gulp.task('release:cdn', function(cb) {
        if (process.env.AWS_SKYGLOBAL_BUCKET) {
            var awsS3 = plugins.awsS3.setup({bucket: process.env.AWS_SKYGLOBAL_BUCKET});
            awsUpload('css',awsS3);
            awsUpload('js', awsS3);
            awsUpload('fonts', awsS3);
            return awsUpload('icons', awsS3);
        } else {
            console.log('**Amazon S3 skipped as AWS env variables are not set**');
            return cb();
        }
    });




    /*
     * Common/public Gulp tasks
     */
    gulp.task('init', function(cb) {
        if (pkg.name.indexOf(' ') >0){
            return console.error('\nSky Component Name Error:' +
                '\nPlease update `package.json` name (without spaces): ' +
                '\n  i.e. `"name" : "responsive-images"`' +
                '\n')
        }
        return runSequence(
            'copy-structure',
            ['rename-dot-gitignore', 'rename-js', 'rename-scss'],
            ['initGHPages'],
            'remove-renamed-files',
            'initBower', //move with other init once automatic
            cb);
    });

    gulp.task('serve', function(callback) {
        return runSequence(
            'build',
            ['browserSync', 'watch'],
            callback
        );
    });

    gulp.task('release', function(cb) {
        return runSequence(
            'bump-version',
            'build',
            'git-commit-push',
            ['release:bower', 'release:gh-pages', 'release:cdn'],
            cb
        );
    });

    return {
        paths: paths
    }
}


module.exports = gulpTasks;