let webSocket;
let keyPromise;

function str2ab(str) {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for(let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

async function handle() {
  const shouldLoad = location.href.startsWith('https://dash.cloudflare.com/two-factor', 0);
  if(!shouldLoad) return;
  keyPromise = chrome.storage.local.get(['publicKey', 'privateKey', 'appPublicKey']);
  await checkForInput();
}

async function checkForInput() {
  const input = document.getElementById('twofactor_token');
  if(input == null) {
    setTimeout(checkForInput, 50);
    return;
  }
  console.log('input found!');
  const { appPublicKey, publicKey } = await keyPromise;
  if(appPublicKey == null) {
    console.log('Not linked yet.');
    return;
  }
  webSocket = new WebSocket('ws://localhost:3000');
  webSocket.onopen = async () => {
    const messageUnencrypted = JSON.stringify({
      action: 'query-code',
      url: location.origin,
    });
    const importedAppPublicKey = await crypto.subtle.importKey(
      'spki',
      str2ab(appPublicKey),
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256',
      },
      false,
      ['encrypt'],
    );
    const encryptedMessage = await crypto.subtle.encrypt({
      name: 'RSA-OAEP',
    }, importedAppPublicKey, new TextEncoder().encode(messageUnencrypted));
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKey));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16)
      .padStart(2, '0'))
      .join('');

    webSocket.send(JSON.stringify({
      event: 'query-code',
      data: {
        hash: hashHex,
        message: encryptedMessage,
      },
    }));
  };
  webSocket.onmessage = async (response) => {
    const responseData = JSON.parse(response.data);
    if(responseData.type === 'code') {
      const { code } = responseData;
      const { privateKey } = await keyPromise;
      const importedPrivateKey = await crypto.subtle.importKey(
        'pkcs8',
        str2ab(privateKey),
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['decrypt'],
      );
      const decryptedBuf = await crypto.subtle.decrypt({
          name: 'RSA-OAEP',
        }, importedPrivateKey,
        str2ab(code));
      const decrypted = new TextDecoder().decode(decryptedBuf);
      input.value = decrypted;
      webSocket.close();
      // document.getElementsByTagName('button')[2].click()
    }
  };

  // const response = await fetch('http://localhost:3000/');
  // const content = await response.json();
  // console.log(content);
  // input.value = content.code;
}

void handle();
