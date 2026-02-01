"""
Services für Haushalts-Management
"""
import re
import requests
from urllib.parse import urlparse
from decimal import Decimal
from typing import Optional, Dict
from bs4 import BeautifulSoup


class LinkParserService:
    """
    Service zum Parsen von Produkt-Links
    Extrahiert Name, Preis, Beschreibung und Bild-URL mit BeautifulSoup4
    """
    
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
    
    def fetch_page(self, url: str, timeout: int = 10) -> Optional[BeautifulSoup]:
        """
        Lädt eine Webseite und gibt BeautifulSoup-Objekt zurück
        """
        try:
            response = requests.get(url, headers=self.HEADERS, timeout=timeout, allow_redirects=True)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'lxml')
        except requests.RequestException as e:
            print(f"Fehler beim Laden der Seite: {e}")
            return None
        except Exception as e:
            print(f"Unerwarteter Fehler: {e}")
            return None
    
    def parse_url(self, url: str) -> Dict[str, Optional[str]]:
        """
        Parst eine URL und versucht Produktdaten zu extrahieren
        
        Args:
            url: Produkt-URL
            
        Returns:
            Dictionary mit name, preis, beschreibung, bild_url
        """
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            parsed_url = urlparse(url)
            domain = parsed_url.netloc.lower()
            
            # Shop-spezifische Parser
            if 'amazon' in domain:
                result = self._parse_amazon(url)
            elif 'ebay' in domain:
                result = self._parse_ebay(url)
            elif 'idealo' in domain:
                result = self._parse_idealo(url)
            elif 'mediamarkt' in domain or 'saturn' in domain:
                result = self._parse_mediamarkt_saturn(url)
            elif 'thomann' in domain:
                result = self._parse_thomann(url)
            elif 'musicstore' in domain:
                result = self._parse_musicstore(url)
            else:
                # Generischer Parser
                result = self._parse_generic(url, parsed_url)
        
        except Exception as e:
            print(f"Link-Parse-Fehler: {e}")
        
        return result
    
    def _parse_amazon(self, url: str) -> Dict:
        """
        Amazon-spezifischer Parser mit BeautifulSoup4
        """
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, 'Amazon')
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname
            title_elem = soup.find('span', {'id': 'productTitle'})
            if title_elem:
                result['name'] = title_elem.text.strip()
            
            # Preis (mehrere Varianten probieren)
            preis_selectors = [
                {'class': 'a-price-whole'},
                {'class': 'a-offscreen'},
                {'id': 'priceblock_ourprice'},
                {'id': 'priceblock_dealprice'},
            ]
            
            for selector in preis_selectors:
                preis_elem = soup.find('span', selector)
                if preis_elem:
                    preis_text = preis_elem.text.strip()
                    # Extrahiere Zahl: "49,99 €" → 49.99
                    preis_match = re.search(r'(\d+[.,]\d+)', preis_text)
                    if preis_match:
                        result['preis'] = Decimal(preis_match.group(1).replace(',', '.'))
                        break
            
            # Produktbild
            img_elem = soup.find('img', {'id': 'landingImage'})
            if not img_elem:
                img_elem = soup.find('img', {'class': 'a-dynamic-image'})
            if img_elem and img_elem.get('src'):
                result['bild_url'] = img_elem.get('src')
            
            # Beschreibung (kurz)
            desc_elem = soup.find('div', {'id': 'feature-bullets'})
            if desc_elem:
                features = desc_elem.find_all('li')
                if features:
                    result['beschreibung'] = features[0].text.strip()[:200]
        
        except Exception as e:
            print(f"Amazon-Parse-Fehler: {e}")
        
        return result
    
    def _parse_ebay(self, url: str) -> Dict:
        """eBay-spezifischer Parser mit BeautifulSoup4"""
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, 'eBay')
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname
            title_elem = soup.find('h1', {'class': 'x-item-title__mainTitle'})
            if not title_elem:
                title_elem = soup.find('h1', {'class': 'it-ttl'})
            if title_elem:
                result['name'] = title_elem.text.strip()
            
            # Preis
            preis_selectors = [
                {'class': 'x-price-primary'},
                {'id': 'prcIsum'},
                {'class': 'notranslate'}
            ]
            
            for selector in preis_selectors:
                preis_elem = soup.find('span', selector)
                if preis_elem:
                    preis_text = preis_elem.text.strip()
                    preis_match = re.search(r'(\d+[.,]\d+)', preis_text)
                    if preis_match:
                        result['preis'] = Decimal(preis_match.group(1).replace(',', '.'))
                        break
            
            # Produktbild
            img_elem = soup.find('img', {'id': 'icImg'})
            if img_elem and img_elem.get('src'):
                result['bild_url'] = img_elem.get('src')
        
        except Exception as e:
            print(f"eBay-Parse-Fehler: {e}")
        
        return result
    
    def _parse_idealo(self, url: str) -> Dict:
        """Idealo-spezifischer Parser mit BeautifulSoup4"""
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, 'Idealo')
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname
            title_elem = soup.find('h1', {'class': 'oopStage-title'})
            if not title_elem:
                title_elem = soup.find('h1')
            if title_elem:
                result['name'] = title_elem.text.strip()
            
            # Preis (bester Preis)
            preis_elem = soup.find('span', {'class': 'oopStage-conditionListPriceValue'})
            if preis_elem:
                preis_text = preis_elem.text.strip()
                preis_match = re.search(r'(\d+[.,]\d+)', preis_text)
                if preis_match:
                    result['preis'] = Decimal(preis_match.group(1).replace(',', '.'))
            
            # Produktbild
            img_elem = soup.find('img', {'class': 'oopStage-mainImage'})
            if img_elem and img_elem.get('src'):
                result['bild_url'] = img_elem.get('src')
        
        except Exception as e:
            print(f"Idealo-Parse-Fehler: {e}")
        
        return result
    
    def _parse_mediamarkt_saturn(self, url: str) -> Dict:
        """MediaMarkt/Saturn-spezifischer Parser"""
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, 'MediaMarkt/Saturn')
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname
            title_elem = soup.find('h1', {'class': 'sc-'})
            if not title_elem:
                title_elem = soup.find('h1')
            if title_elem:
                result['name'] = title_elem.text.strip()
            
            # Preis
            preis_elem = soup.find('span', {'class': 'price'})
            if preis_elem:
                preis_text = preis_elem.text.strip()
                preis_match = re.search(r'(\d+[.,]\d+)', preis_text)
                if preis_match:
                    result['preis'] = Decimal(preis_match.group(1).replace(',', '.'))
        
        except Exception as e:
            print(f"MediaMarkt/Saturn-Parse-Fehler: {e}")
        
        return result
    
    def _parse_thomann(self, url: str) -> Dict:
        """
        Thomann-spezifischer Parser
        Beachtet deutsches Zahlenformat: 23.999 = 23999€, 209,99 = 209.99€
        """
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, 'Thomann')
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname - Thomann verwendet verschiedene Strukturen
            # 1. Versuche <title> Tag (enthält oft den vollständigen Produktnamen)
            title_tag = soup.find('title')
            if title_tag:
                title_text = title_tag.text.strip()
                # Entferne " – Thomann Deutschland" oder ähnliches
                if ' – ' in title_text:
                    result['name'] = title_text.split(' – ')[0].strip()
                elif ' - ' in title_text:
                    result['name'] = title_text.split(' - ')[0].strip()
                elif ' | ' in title_text:
                    result['name'] = title_text.split(' | ')[0].strip()
                else:
                    result['name'] = title_text
            
            # 2. Falls kein Name, versuche andere Selektoren
            if not result['name']:
                title_selectors = [
                    ('h1', {'class': 'product-title'}),
                    ('h1', {'class': 'rs-prod-title'}),
                    ('h1', {}),
                    ('span', {'itemprop': 'name'}),
                    ('div', {'class': 'product-name'}),
                ]
                
                for tag, attrs in title_selectors:
                    title_elem = soup.find(tag, attrs) if attrs else soup.find(tag)
                    if title_elem:
                        text = title_elem.text.strip()
                        if text and len(text) > 3:  # Mindestens 3 Zeichen
                            result['name'] = text
                            break
            
            # Preis - Verkaufspreis, NICHT UVP!
            # Thomann zeigt den Verkaufspreis prominent und UVP durchgestrichen
            preis_selectors = [
                {'class': 'price'},
                {'class': 'fx-currency'},
                {'itemprop': 'price'},
            ]
            
            for selector in preis_selectors:
                preis_elem = soup.find('span', selector)
                if not preis_elem:
                    preis_elem = soup.find('div', selector)
                
                if preis_elem:
                    preis_text = preis_elem.text.strip()
                    
                    # Deutsches Format: 23.999,00 € oder 119 € oder 209,99 €
                    # Extrahiere Zahlen mit Punkt und/oder Komma
                    preis_match = re.search(r'(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)', preis_text)
                    
                    if preis_match:
                        preis_str = preis_match.group(1)
                        
                        # Deutsches Format konvertieren:
                        # 1. Punkte entfernen (Tausender-Trennzeichen)
                        # 2. Komma durch Punkt ersetzen (Dezimaltrennzeichen)
                        preis_str = preis_str.replace('.', '')  # 23.999 → 23999
                        preis_str = preis_str.replace(',', '.')  # 209,99 → 209.99
                        
                        try:
                            result['preis'] = Decimal(preis_str)
                            break
                        except:
                            continue
            
            # Beschreibung
            desc_selectors = [
                {'class': 'product-description'},
                {'itemprop': 'description'},
                {'class': 'description'}
            ]
            
            for selector in desc_selectors:
                desc_elem = soup.find('div', selector)
                if not desc_elem:
                    desc_elem = soup.find('p', selector)
                
                if desc_elem:
                    result['beschreibung'] = desc_elem.text.strip()[:200]
                    break
            
            # Produktbild
            img_elem = soup.find('img', {'itemprop': 'image'})
            if not img_elem:
                img_elem = soup.find('img', {'class': 'product-image'})
            
            if img_elem and img_elem.get('src'):
                src = img_elem.get('src')
                # Thomann Cookie-Bild ignorieren
                if 'cookie' not in src.lower():
                    result['bild_url'] = src
        
        except Exception as e:
            print(f"Thomann-Parse-Fehler: {e}")
        
        return result
    
    def _parse_musicstore(self, url: str) -> Dict:
        """
        Musicstore-spezifischer Parser
        Beachtet deutsches Zahlenformat wie bei Thomann
        """
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, 'Musicstore')
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname
            title_selectors = [
                {'itemprop': 'name'},
                {'class': 'product-title'},
                {'class': 'title'},
                'h1'
            ]
            
            for selector in title_selectors:
                if isinstance(selector, str):
                    title_elem = soup.find(selector)
                else:
                    title_elem = soup.find(attrs=selector)
                
                if title_elem:
                    result['name'] = title_elem.text.strip()
                    break
            
            # Preis - Verkaufspreis mit deutschem Zahlenformat
            preis_selectors = [
                {'class': 'price'},
                {'class': 'product-price'},
                {'itemprop': 'price'},
                {'class': 'final-price'},
            ]
            
            for selector in preis_selectors:
                preis_elem = soup.find('span', selector)
                if not preis_elem:
                    preis_elem = soup.find('div', selector)
                
                if preis_elem:
                    preis_text = preis_elem.text.strip()
                    
                    # Deutsches Format: 23.999,00 € oder 119 € oder 209,99 €
                    preis_match = re.search(r'(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)', preis_text)
                    
                    if preis_match:
                        preis_str = preis_match.group(1)
                        
                        # Deutsches Format konvertieren:
                        preis_str = preis_str.replace('.', '')   # 23.999 → 23999
                        preis_str = preis_str.replace(',', '.')  # 209,99 → 209.99
                        
                        try:
                            result['preis'] = Decimal(preis_str)
                            break
                        except:
                            continue
            
            # Beschreibung
            desc_selectors = [
                {'class': 'product-description'},
                {'class': 'description'},
                {'itemprop': 'description'},
                {'class': 'short-description'}
            ]
            
            for selector in desc_selectors:
                desc_elem = soup.find('div', selector)
                if not desc_elem:
                    desc_elem = soup.find('p', selector)
                
                if desc_elem:
                    result['beschreibung'] = desc_elem.text.strip()[:200]
                    break
            
            # Produktbild
            img_elem = soup.find('img', {'itemprop': 'image'})
            if not img_elem:
                img_elem = soup.find('img', {'class': 'product-image'})
            if not img_elem:
                img_elem = soup.find('img', {'class': 'main-image'})
            
            if img_elem and img_elem.get('src'):
                src = img_elem.get('src')
                if src.startswith('//'):
                    src = 'https:' + src
                result['bild_url'] = src
        
        except Exception as e:
            print(f"Musicstore-Parse-Fehler: {e}")
        
        return result
    
    def _fallback_result(self, url: str, shop_name: str) -> Dict:
        """
        Fallback wenn Scraping fehlschlägt - versucht aus URL zu extrahieren
        """
        parsed_url = urlparse(url)
        path_parts = [p for p in parsed_url.path.split('/') if p]
        
        name = f'{shop_name} Produkt'
        if path_parts:
            last_part = path_parts[-1]
            name = re.sub(r'[_-]', ' ', last_part)
            name = re.sub(r'\.\w+$', '', name)
            name = name.title()
        
        return {
            'name': name,
            'preis': None,
            'beschreibung': f'Produkt von {shop_name}',
            'bild_url': None,
        }
    
    def _parse_generic(self, url: str, parsed_url) -> Dict:
        """
        Generischer Parser für unbekannte Shops
        Versucht mit BeautifulSoup4 generische Selektoren zu finden
        """
        soup = self.fetch_page(url)
        
        if not soup:
            return self._fallback_result(url, parsed_url.netloc)
        
        result = {
            'name': None,
            'preis': None,
            'beschreibung': None,
            'bild_url': None,
        }
        
        try:
            # Produktname (verschiedene Varianten)
            title_selectors = ['h1', 'h2', '.product-title', '.product-name', '#product-name']
            for selector in title_selectors:
                if '.' in selector or '#' in selector:
                    title_elem = soup.select_one(selector)
                else:
                    title_elem = soup.find(selector)
                
                if title_elem:
                    result['name'] = title_elem.text.strip()
                    break
            
            # Preis (verschiedene Klassen probieren)
            preis_keywords = ['price', 'preis', 'cost', 'amount']
            for keyword in preis_keywords:
                preis_elems = soup.find_all(class_=re.compile(keyword, re.IGNORECASE))
                for elem in preis_elems:
                    text = elem.text.strip()
                    preis_match = re.search(r'(\d+[.,]\d+)', text)
                    if preis_match:
                        result['preis'] = Decimal(preis_match.group(1).replace(',', '.'))
                        break
                if result['preis']:
                    break
            
            # Produktbild (erstes großes Bild)
            img_elems = soup.find_all('img')
            for img in img_elems:
                src = img.get('src')
                if src and not any(skip in src.lower() for skip in ['logo', 'icon', 'banner', 'sprite']):
                    result['bild_url'] = src
                    break
            
            # Meta-Description als Fallback
            if not result['beschreibung']:
                meta_desc = soup.find('meta', {'name': 'description'})
                if meta_desc and meta_desc.get('content'):
                    result['beschreibung'] = meta_desc.get('content')[:200]
        
        except Exception as e:
            print(f"Generic-Parse-Fehler: {e}")
        
        return result
