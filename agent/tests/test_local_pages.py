import json
import unittest
import urllib.request

from stagedesk_agent.local_pages import LocalPages, format_code


class LocalPageTests(unittest.TestCase):
    def test_format_code_groups_after_three_digits(self):
        self.assertEqual(format_code("482913"), "482 913")

    def test_local_page_shows_code_grouped(self):
        pages = LocalPages()
        pages.show_code("482913")
        html = pages.render()
        self.assertIn("Kopplungscode 482 913", html)
        self.assertIn("Im Stagedesk-Admin unter Monitore → Übersicht → Bildschirm koppeln eingeben.", html)

    def test_local_page_no_server_text(self):
        pages = LocalPages()
        pages.show_no_server()
        self.assertIn("Keine Verbindung zum Server. Netzwerk prüfen.", pages.render())

    def test_test_pattern_then_reverts(self):
        now = [100.0]
        pages = LocalPages(clock=lambda: now[0])
        pages.show_code("123456")
        pages.show_test_pattern("Mensa", "3840x2160", seconds=60)
        html = pages.render()
        self.assertIn("Mensa", html)
        self.assertIn("3840x2160", html)
        now[0] += 61
        self.assertIn("Kopplungscode 123 456", pages.render())

    def test_show_none_is_blank(self):
        pages = LocalPages()
        pages.show_code("123456")
        pages.show_none()
        self.assertNotIn("Kopplungscode", pages.render())

    def test_no_external_resources(self):
        pages = LocalPages()
        pages.show_code("123456")
        html = pages.render()
        self.assertNotIn("http://", html.replace("http://www.w3.org", ""))
        self.assertNotIn("https://", html)

    def test_html_escapes_text(self):
        pages = LocalPages()
        pages.show_test_pattern("<b>x</b>", "1x1")
        self.assertNotIn("<b>x</b>", pages.render())

    def test_page_polls_local_state(self):
        html = LocalPages().render()
        self.assertIn("setInterval", html)
        self.assertIn("/state", html)
        self.assertIn("2000", html)

    def test_state_reflects_changes(self):
        now = [0.0]
        pages = LocalPages(clock=lambda: now[0])
        pages.show_code("482913")
        self.assertIn("482 913", pages.state()["body"])
        pages.show_no_server()
        self.assertIn("Keine Verbindung zum Server. Netzwerk prüfen.", pages.state()["body"])
        pages.show_test_pattern("Mensa", "1920x1080", seconds=60)
        self.assertIn("Mensa", pages.state()["body"])
        now[0] = 61
        self.assertNotIn("Mensa", pages.state()["body"])

    def test_state_endpoint_over_http(self):
        pages = LocalPages(port=0)
        pages.start()
        self.addCleanup(pages.stop)
        pages.show_no_server()
        with urllib.request.urlopen(f"http://127.0.0.1:{pages.port}/state") as resp:
            data = json.loads(resp.read())
        self.assertIn("Keine Verbindung", data["body"])

    def test_serves_over_http(self):
        pages = LocalPages(port=0)
        pages.start()
        self.addCleanup(pages.stop)
        pages.show_code("482913")
        with urllib.request.urlopen(f"http://127.0.0.1:{pages.port}/") as resp:
            body = resp.read().decode()
        self.assertIn("482 913", body)
