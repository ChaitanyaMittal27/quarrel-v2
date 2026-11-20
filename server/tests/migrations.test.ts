import pg from 'pg';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { testDb } from './helpers';

describe('Postgres migrations', () => {
  it('fresh database, idempotence, failed-file rollback and concurrent startup lock', async () => {
    const control = testDb(), lock = await control.connect();
    let fresh: pg.Pool | undefined, owned = false, folder: string | undefined;
    try {
      await lock.query('SELECT pg_advisory_lock(74829164)');
      // Static test-only database identifier; never interpolate SQL identifiers or request data.
      await lock.query('CREATE DATABASE quarrel_stage8_migration_tests'); owned = true;
      fresh = new pg.Pool({ host:'localhost', port:5433, user:'quarrel', password:'quarrel', database:'quarrel_stage8_migration_tests' });
      expect(await migrate(fresh)).toEqual(['001_archive.sql']);
      expect(await migrate(fresh)).toEqual([]);
      folder = await mkdtemp(join(tmpdir(),'quarrel-migrations-'));
      await writeFile(join(folder,'002_bad.sql'), 'CREATE TABLE rollback_probe (id int); SELECT 1/0;', 'utf8');
      await expect(migrate(fresh,folder)).rejects.toThrow();
      expect((await fresh.query("SELECT to_regclass('rollback_probe') AS name")).rows[0].name).toBeNull();
      expect((await fresh.query('SELECT name FROM schema_migrations WHERE name=$1',['002_bad.sql'])).rowCount).toBe(0);
      // Replace only the temporary test fixture; repository files are never deleted here.
      await writeFile(join(folder,'002_bad.sql'), 'CREATE TABLE concurrency_probe (id int);', 'utf8');
      const applied = await Promise.all([migrate(fresh,folder),migrate(fresh,folder)]);
      expect(applied.flat()).toEqual(['002_bad.sql']);
      expect((await fresh.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count).toBe(2);
    } finally {
      await fresh?.end();
      if (owned) await lock.query('DROP DATABASE quarrel_stage8_migration_tests');
      await lock.query('SELECT pg_advisory_unlock(74829164)'); lock.release(); await control.end();
      if (folder) await rm(folder,{recursive:true,force:true});
    }
  }, 15000);
});
