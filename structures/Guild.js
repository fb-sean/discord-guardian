const {
    Structures
} = require('discord.js');

const { limits } = require('../config.js');

Structures.extend('Guild', Guild => {
    class GuildExt extends Guild {
        constructor(...args) {
            super(...args);
        }

        get(key, fallback) {
            return this.client.db.get(`${this.id}_${key}`) || fallback;
        }

        set(key, data) {
            return this.client.db.set(`${this.id}_${key}`, data);
        }

        delete(key) {
            return this.client.db.delete(`${this.id}_${key}`);
        }

        get limits() {
            var obj = {};
            for (var k in limits) {
                obj[k] = {
                    minute: this.get(`limits.${k}.minute`, limits[k].per_minute),
                    hour: this.get(`limits.${k}.hour`, limits[k].per_hour)
                }  
            }
            return obj;
        }

        find_entry(action, filter) {
            let guild = this;
            return new Promise((resolve) => {
                (async function search(iter) {
                    console.log(`ACTION = ${action} | ITER = ${iter}`);

                    if (!guild.me) return resolve(null);

                    if (guild.me.hasPermission('VIEW_AUDIT_LOG')) {

                        let logs = await guild.fetchAuditLogs({ limit: 10, type: action });
                        let entries = logs.entries;
                        let entry = null;

                        entries = entries.filter(filter);

                        for (var e of entries)
                            if (!entry || e[0] > entry.id) entry = e[1];

                        if (entry) return resolve(entry);

                    }

                    if (++iter === 5) return resolve(null);
                    else return setTimeout(search, 200, iter);
                })(0)
            })
        }

        push_entry(entry, displayName) {
            const action = entry.action;
            const oneHourAgo = Date.now() - 1000 * 60 * 60;

            // Fetch Entries for a sepcific action (Last Hour)
            let entries = this.get(action, []);

            // Filter entries older than one hour to a new variable
            let olderThanOneHour = entries.filter(i => !(i.timestamp > oneHourAgo));

            // Prepend entries older than one hour to the archive
            if (olderThanOneHour.length > 0) this.set(`archive.${action}`, [...olderThanOneHour, ...this.get(`archive.${action}`, [])]);

            // Filter entries older than one hour from old variable
            entries = entries.filter(i => i.timestamp > oneHourAgo);

            // Prepend new entry if not already found
            entries.unshift({
                timestamp: entry.createdTimestamp,
                target: {
                    id: entry.target.id,
                    displayName,
                    targetType: entry.targetType
                },
                executor: {
                    id: entry.executor.id,
                    displayName: entry.executor.tag
                }
            });

            // Update entries newer than one hour
            return this.set(action, entries);

        }

        async check_limits(entries, executorID, configAction) {
            const oneMinuteAgo = Date.now() - 1000 * 60;

            // Filter actions relating to executor
            let executorActionsHour = entries.filter(i => i.executor.id === executorID);
            let executorActionsMinute = executorActionsHour.filter(i => i.timestamp > oneMinuteAgo);
            console.log(`${configAction}/${executorID}: LAST_HOUR: ${executorActionsHour.length} LAST_MINUTE: ${executorActionsMinute.length} `);

            let limits = this.limits;

            // Check if the amount of actions is greater than or equal to the limit
            if (executorActionsHour.length >= limits[configAction].hour || executorActionsMinute.length >= limits[configAction].minute) {

                // Remove all of the executor's roles
                let executor = await this.members.fetch(executorID);
                executor.roles.remove(this.members.get(executorID.roles));

                // Notify owner & executor
                

            }

        }

    }

    return GuildExt;
});