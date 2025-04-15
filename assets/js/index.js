/* Skills */
const skillsTech = document.querySelector('.skills-tech')

const skills = [
  // {
  //   path: 'https://www.logo.wine/a/logo/Google_Chrome/Google_Chrome-Logo.wine.svg',
  //   name: 'Chrome',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1705068793/vsc_m9yr7b.svg',
  //   name: 'VS CODE',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1705068791/html_q6pvb3.svg',
  //   name: 'HTML',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1705069308/logo-css-3-2048_dkollb.png',
  //   name: 'CSS',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1705068791/javascript_u1zqf9.svg',
  //   name: 'JAVASCRIPT',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1705068793/react_ufwyeu.svg',
  //   name: 'REACT',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715125614/pngwing.com_u1n0ff.png',
  //   name: 'NPM',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715126845/pngwing.com_4_xd8c7k.png',
  //   name: 'NODE.JS',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715125373/tailwind-css-logo-24_f921tf.png',
  //   name: 'TAILWIND',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715125758/pngegg_fpc4zr.png',
  //   name: 'GIT',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715125844/pngwing.com_2_h3i32t.png',
  //   name: 'POSTRGRES',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715125980/pngwing.com_3_zltarm.png',
  //   name: 'EXPRESS',
  // },
  // {
  //   path: 'https://res.cloudinary.com/dfc7m5ola/image/upload/v1715126047/klipartz.com_oznl55.png',
  //   name: 'SEQUELIZE',
  // }
]

let html = ''

for (const skill of skills) {
  html += `
  <div class='skill'>
    <img src='${skill.path}' alt='${skill.name}'>
    <h3>${skill.name}</h3>
  </div>
`
}

skillsTech.innerHTML = html

/* NavBar */
const navbar = document.querySelector('.nav')
const menu = document.querySelector('.nav-menu')
const links = document.querySelectorAll('.list-link')

navbar.addEventListener('click', function (e) {
  if (e.target.closest('.btn-open')) {
    menu.classList.toggle('show-menu')
  }

  if (e.target.closest('.btn-close')) {
    menu.classList.remove('show-menu')
  }

  if (e.target.closest('.list-link')) {
    menu.classList.remove('show-menu')
  }

  if (e.target.closest('.list-link')) {
    for (const link of links) {
      link.parentElement.classList.remove('active')
    }

    e.target.parentElement.classList.add('active')
  }
})

/* Light Mode */
const btnLight = document.querySelector('.btn-theme')

// Comprobar si el modo light está activado
// getItem -> Obtener datos del localStorage
const theme = window.localStorage.getItem('theme')

if (theme) {
  document.body.classList.add('light')
  changeTheme(true)
} else {
  document.body.classList.remove('light')
  changeTheme(false)
}

btnLight.addEventListener('click', function () {
  document.body.classList.toggle('light')

  if (document.body.classList.contains('light')) {
    changeTheme(true)
  } else {
    changeTheme(false)
  }
})

function changeTheme (bool) {
  if (bool) {
    btnLight.firstElementChild.classList.remove('bxs-moon')
    btnLight.firstElementChild.classList.add('bxs-sun')
    // setItem -> Almacenar datos en el localStorage
    window.localStorage.setItem('theme', 'light')
  } else {
    btnLight.firstElementChild.classList.remove('bxs-sun')
    btnLight.firstElementChild.classList.add('bxs-moon')
    // removeItem -> Eliminar datos del localStorage
    window.localStorage.removeItem('theme')
  }
}
