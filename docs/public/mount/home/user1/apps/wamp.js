
const win = (window.top || window);
const doc = win.document
const body = doc.body || document.body;
const el = doc.createElement('div')
el.style.position = 'static'
el.style.top = '0'



// const webamp = new Webamp();

const openPlayer = () => {
  const AA = "My"
  const app = el
  const webamp = win.webamp || new win.Webamp({
    zIndex: 10,
    windowLayout: {
      main: {
        position: { top: 0, left: 0 },
        shadeMode: false,
        closed: false,
      },
      equalizer: {
        position: { top: 430, left: 0 },
        shadeMode: true,
        closed: false,
      },
      playlist: {
        position: { top: 230, left: 0 },
        shadeMode: false,
        size: { extraHeight: 3, extraWidth: 11 },
        closed: false,
      },
    },
    enableDoubleSizeMode: true,
    // Optional. An array of objects representing skins.
    // These will appear in the "Options" menu under "Skins".
    // Note: These URLs must be served with the correct CORs headers.
    //
    // These will appear in the dropdown menu under "Skins".
    availableSkins: [
      {
        url: "https://r2.webampskins.org/skins/c4e6507d36c7cd088f8d3face19441aa.wsz",
        name: "My Skin 1",
      },
      {
        url: "https://r2.webampskins.org/skins/b2a45ec6829c60d8ccb66cfce2b6e9c7.wsz",
        name: "My Skin 2",
      },
      {
        url: "https://archive.org/cors/winampskin_Green-Dimension-V2/Green-Dimension-V2.wsz",
        name: "Green Dimension V2",
      },
      {
        url: "https://archive.org/cors/winampskin_mac_os_x_1_5-aqua/mac_os_x_1_5-aqua.wsz",
        name: "Mac OSX v1.5 (Aqua)",
      },


    ],
    //     initialSkin: {
    //   // NOTE: Your skin file must be served from the same domain as your HTML
    //   // file, or served with permissive CORS HTTP headers:
    //   // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    //   // Can be downloaded from https://github.com/captbaritone/webamp/raw/master/skins/TopazAmp1-2.wsz
    //   url: "https://r2.webampskins.org/skins/b2a45ec6829c60d8ccb66cfce2b6e9c7.wsz"
    // },
    initialTracks: [
      {
        metaData: {
          artist: "DJ Mike Llama",
          title: "Llama Whippin' Intro",
        },
        // NOTE: Your audio file must be served from the same domain as your HTML
        // file, or served with permissive CORS HTTP headers:
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
        url: "https://cdn.jsdelivr.net/gh/captbaritone/webamp@43434d82cfe0e37286dbbe0666072dc3190a83bc/mp3/llama-2.91.mp3",
        duration: 5.322286,
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Diablo_Swing_Orchestra_-_01_-_Heroines.mp3",
        duration: 322.612245,
        metaData: {
          title: "Heroines",
          artist: "Diablo Swing Orchestra",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Eclectek_-_02_-_We_Are_Going_To_Eclecfunk_Your_Ass.mp3",
        duration: 190.093061,
        metaData: {
          title: "We Are Going To Eclecfunk Your Ass",
          artist: "Eclectek",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Auto-Pilot_-_03_-_Seventeen.mp3",
        duration: 214.622041,
        metaData: {
          title: "Seventeen",
          artist: "Auto-Pilot",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Muha_-_04_-_Microphone.mp3",
        duration: 181.838367,
        metaData: {
          title: "Microphone",
          artist: "Muha",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Just_Plain_Ant_-_05_-_Stumble.mp3",
        duration: 86.047347,
        metaData: {
          title: "Stumble",
          artist: "Just Plain Ant",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Sleaze_-_06_-_God_Damn.mp3",
        duration: 226.795102,
        metaData: {
          title: "God Damn",
          artist: "Sleaze",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Juanitos_-_07_-_Hola_Hola_Bossa_Nova.mp3",
        duration: 207.072653,
        metaData: {
          title: "Hola Hola Bossa Nova",
          artist: "Juanitos",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Entertainment_for_the_Braindead_-_08_-_Resolutions_Chris_Summer_Remix.mp3",
        duration: 314.331429,
        metaData: {
          title: "Resolutions (Chris Summer Remix)",
          artist: "Entertainment for the Braindead",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Nobara_Hayakawa_-_09_-_Trail.mp3",
        duration: 204.042449,
        metaData: {
          title: "Trail",
          artist: "Nobara Hayakawa",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/Paper_Navy_-_10_-_Tongue_Tied.mp3",
        duration: 201.116735,
        metaData: {
          title: "Tongue Tied",
          artist: "Paper Navy",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/60_Tigres_-_11_-_Garage.mp3",
        duration: 245.394286,
        metaData: {
          title: "Garage",
          artist: "60 Tigres",
          album: AA
        }
      }, {
        url: "https://raw.githubusercontent.com/captbaritone/webamp-music/4b556fbf/CM_aka_Creative_-_12_-_The_Cycle_Featuring_Mista_Mista.mp3",
        duration: 221.44,
        metaData: {
          title: "The Cycle (Featuring Mista Mista)",
          artist: "CM aka Creative",
          album: AA
        }
      }
    ],
  });

  if (!win.webamp) {
    win.webamp = webamp;
    webamp.renderWhenReady(app).then(() => {
      console.log('rendered webamp!');
      win.webamp.play()
    });
  }

  else {
    win.webamp.reopen()
    win.webamp.play()
  }

  // const props = platform.getService('props');
  // props.close()
}

const { remove } = platform.host.registerCommand("webamp", () => {
  if (win.Webamp) {
  openPlayer()
}
else {
  body.appendChild(el)
  // const app = doc.querySelector('.layout-default') || document.getElementById("app")
  const script = doc.createElement('script')
  script.onload = () => {
    openPlayer()
  }
  script.src = 'https://unpkg.com/webamp'
  body.appendChild(script)

}
}, {
   callable: true,
   icon: "music_note",
   title: "Webamp",
   fullScreen: false,
   header: {style: {backgroundColor: ''}}
});
