module.exports = {
    apps: [
        {
            name: 'dateandcrumb',
            script: 'server.js',
            cwd: '/var/www/dateandcrumb',
            env_production: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
        },
    ],
};
