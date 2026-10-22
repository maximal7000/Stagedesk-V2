import hashlib
import io
import tarfile
from pathlib import Path

from django.test import SimpleTestCase, TestCase, override_settings

from . import agent_package, devices
from .models import Device, DeviceEvent, Screen

AGENT_DIR = Path(__file__).resolve().parent.parent.parent / 'agent'


class AgentPackageTest(SimpleTestCase):
    def setUp(self):
        agent_package.clear_cache()
        self.addCleanup(agent_package.clear_cache)

    def members(self):
        with tarfile.open(fileobj=io.BytesIO(agent_package.build_package()), mode='r:gz') as tar:
            return {m.name: tar.extractfile(m).read() for m in tar.getmembers() if m.isfile()}, tar.getmembers()

    def test_version_is_read_from_version_file(self):
        version, sha = agent_package.agent_package_info()
        self.assertEqual(version, (AGENT_DIR / 'VERSION').read_text().strip())
        self.assertEqual(sha, hashlib.sha256(agent_package.build_package()).hexdigest())

    def test_package_layout(self):
        files, _ = self.members()
        self.assertIn('VERSION', files)
        self.assertIn('stagedesk_agent/__init__.py', files)
        self.assertIn('stagedesk_agent/self_update.py', files)
        self.assertIn('systemd/stagedesk-agent.service', files)
        self.assertIn('systemd/stagedesk-kiosk.service', files)
        self.assertIn('kiosk/kiosk.sh', files)
        self.assertEqual(files['VERSION'].decode().strip(), agent_package.agent_package_info()[0])
        for name in files:
            self.assertRegex(name, r'^(VERSION|stagedesk_agent/|systemd/|kiosk/)')

    def test_package_contains_no_tests_or_secrets(self):
        files, _ = self.members()
        for name, content in files.items():
            self.assertNotIn('tests/', name)
            self.assertNotIn('__pycache__', name)
            self.assertFalse(name.endswith('.pyc'), name)
            self.assertNotEqual(Path(name).name, '.env')
            self.assertNotIn(b'token=', content, name)

    def test_package_deterministic(self):
        first = agent_package.build_package()
        agent_package.clear_cache()
        second = agent_package.build_package()
        self.assertEqual(first, second)
        _, members = self.members()
        self.assertEqual({m.mtime for m in members}, {0})
        self.assertEqual({(m.uid, m.gid) for m in members}, {(0, 0)})
        names = [m.name for m in members]
        self.assertEqual(names, sorted(names))

    def test_script_modes(self):
        _, members = self.members()
        modes = {m.name: m.mode for m in members}
        self.assertEqual(modes['kiosk/kiosk.sh'], 0o755)
        self.assertEqual(modes['VERSION'], 0o644)

    def test_result_cached_per_version(self):
        self.assertIs(agent_package.build_package(), agent_package.build_package())


class AgentDeliveryRoutesTest(TestCase):
    def setUp(self):
        agent_package.clear_cache()
        self.addCleanup(agent_package.clear_cache)

    def test_version_endpoint_matches_package_hash(self):
        r = self.client.get('/api/monitor/agent/version')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        version, sha = agent_package.agent_package_info()
        self.assertEqual(body, {'version': version, 'sha256': sha})
        tarball = self.client.get(f'/api/monitor/agent/stagedesk-agent-{version}.tar.gz')
        self.assertEqual(tarball.status_code, 200)
        self.assertEqual(tarball['Content-Type'], 'application/gzip')
        self.assertEqual(hashlib.sha256(tarball.content).hexdigest(), body['sha256'])

    def test_tarball_other_version_404(self):
        self.assertEqual(self.client.get('/api/monitor/agent/stagedesk-agent-9.9.9.tar.gz').status_code, 404)

    @override_settings(PUBLIC_BASE_URL='https://example.test')
    def test_install_script_served_with_base_url(self):
        r = self.client.get('/api/monitor/agent/install.sh')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r['Content-Type'].startswith('text/plain'))
        text = r.content.decode()
        self.assertTrue(text.startswith('#!/bin/bash'))
        self.assertIn('https://example.test', text)
        self.assertNotIn('__STAGEDESK_SERVER__', text)

    def test_hello_carries_real_package_info(self):
        screen = Screen.objects.create(name='A', slug='a')
        device = Device.objects.create(screen=screen, serial='x')
        hello = devices.hello_payload(device)
        version, sha = agent_package.agent_package_info()
        self.assertEqual((hello['agent_version'], hello['agent_sha256']), (version, sha))


class AgentUpdatedEventTest(TestCase):
    def setUp(self):
        self.screen = Screen.objects.create(name='A', slug='a')
        self.device = Device.objects.create(screen=self.screen, serial='x')
        self.event = {'from': '1.0.0', 'to': '1.0.1', 'at': '2026-10-20T03:10:00+00:00'}

    def events(self):
        return DeviceEvent.objects.filter(device=self.device, kind='agent_updated')

    def test_event_created_once(self):
        devices.record_agent_update(self.device, self.event)
        devices.record_agent_update(self.device, dict(self.event))
        self.assertEqual(self.events().count(), 1)
        self.assertEqual(self.events().get().text, 'Agent aktualisiert von 1.0.0 auf 1.0.1')

    def test_second_update_is_a_new_event(self):
        devices.record_agent_update(self.device, self.event)
        devices.record_agent_update(self.device, {'from': '1.0.1', 'to': '1.0.2', 'at': '2026-10-27T03:10:00+00:00'})
        self.assertEqual(self.events().count(), 2)

    def test_invalid_event_ignored(self):
        for bad in (None, 'x', {}, {'from': '1.0.0'}, {'from': 1, 'to': 2, 'at': 3}):
            devices.record_agent_update(self.device, bad)
        self.assertEqual(self.events().count(), 0)

    def test_store_telemetry_records_event_not_repeated(self):
        data = {'system': {'agent_version': '1.0.1'}, 'agent_updated': self.event}
        devices.store_telemetry(self.device, data)
        devices.store_telemetry(self.device, data)
        self.assertEqual(self.events().count(), 1)
