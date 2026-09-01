import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveName, parseCrontab } from "../src/crontab.js";

test("parses a basic 5-field line", () => {
  const { jobs, skipped } = parseCrontab("0 3 * * * /opt/bin/backup.sh --full");
  assert.equal(skipped.length, 0);
  assert.equal(jobs.length, 1);
  assert.deepEqual(
    { s: jobs[0]!.schedule, c: jobs[0]!.command, n: jobs[0]!.name, tz: jobs[0]!.timezone },
    { s: "0 3 * * *", c: "/opt/bin/backup.sh --full", n: "backup.sh", tz: "UTC" },
  );
});

test("skips comments and blank lines", () => {
  const { jobs } = parseCrontab("# a comment\n\n   \n0 * * * * ./run.sh");
  assert.equal(jobs.length, 1);
});

test("CRON_TZ / TZ scope the timezone for later lines", () => {
  const { jobs } = parseCrontab(
    ["0 1 * * * ./early.sh", "TZ=America/Chicago", "0 2 * * * ./late.sh"].join("\n"),
  );
  assert.equal(jobs[0]!.timezone, "UTC");
  assert.equal(jobs[1]!.timezone, "America/Chicago");
});

test("expands the @daily family to 5-field cron", () => {
  const { jobs } = parseCrontab(
    ["@daily ./d.sh", "@hourly ./h.sh", "@weekly ./w.sh", "@monthly ./m.sh", "@yearly ./y.sh"].join(
      "\n",
    ),
  );
  assert.deepEqual(
    jobs.map((j) => j.schedule),
    ["0 0 * * *", "0 * * * *", "0 0 * * 0", "0 0 1 * *", "0 0 1 1 *"],
  );
});

test("macro aliases: @midnight -> daily, @annually -> yearly", () => {
  const { jobs } = parseCrontab("@midnight ./a.sh\n@annually ./b.sh");
  assert.deepEqual(jobs.map((j) => j.schedule), ["0 0 * * *", "0 0 1 1 *"]);
});

test("@reboot is skipped with a reason", () => {
  const { jobs, skipped } = parseCrontab("@reboot ./boot.sh");
  assert.equal(jobs.length, 0);
  assert.match(skipped[0]!.reason, /@reboot/);
});

test("env assignments are not jobs", () => {
  const { jobs, skipped } = parseCrontab('MAILTO="me@x.com"\nPATH=/usr/bin\n0 0 * * * ./j.sh');
  assert.equal(jobs.length, 1);
  assert.equal(skipped.length, 0);
});

test("truncates the command at an unescaped %", () => {
  const { jobs } = parseCrontab("0 0 * * * /bin/mail -s hi me%line one%line two");
  assert.equal(jobs[0]!.command, "/bin/mail -s hi me");
});

test("short lines (fewer than 5 fields + command) are skipped", () => {
  const { jobs, skipped } = parseCrontab("0 0 * * *");
  assert.equal(jobs.length, 0);
  assert.equal(skipped.length, 1);
});

test("duplicate names get a counter suffix", () => {
  const { jobs } = parseCrontab(
    ["0 1 * * * /a/backup.sh", "0 2 * * * /b/backup.sh", "0 3 * * * /c/backup.sh"].join("\n"),
  );
  assert.deepEqual(jobs.map((j) => j.name), ["backup.sh", "backup.sh 2", "backup.sh 3"]);
});

test("deriveName heuristics", () => {
  assert.equal(deriveName("/usr/local/bin/backup.sh --full"), "backup.sh");
  assert.equal(deriveName("cd /srv/app && ./run.sh"), "run.sh");
  assert.equal(deriveName("python /opt/etl/main.py"), "main.py");
  assert.equal(deriveName("flock -n /tmp/l /opt/jobs/sync"), "sync");
  assert.equal(deriveName("echo hello"), "echo");
});
