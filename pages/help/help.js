const {
  getSpeciesById
} = require('../../data/species.js')

const {
  rescueContacts,
  getRescueGuideBySpeciesId
} = require('../../data/rescue.js')

Page({
  data: {
    species: null,
    rescueContacts: rescueContacts,
    rescueGuide: null
  },

  onLoad(options) {
    const speciesId = Number(options.speciesId)
    const species = getSpeciesById(speciesId)

    if (!species) {
      wx.showToast({
        title: '暂未获取到物种资料',
        icon: 'none'
      })
      return
    }

    const rescueGuide =
      getRescueGuideBySpeciesId(speciesId)

    this.setData({
      species,
      rescueGuide
    })
  },

  callContact(e) {
    const id = e.currentTarget.dataset.id

    const contact = this.data.rescueContacts.find(
      item => item.id === id
    )

    if (!contact || !contact.phone) {
      wx.showToast({
        title: '暂无可拨打的电话',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认联系',
      content:
        `${contact.name}\n电话：${contact.phone}\n${contact.description}`,
      confirmText: '继续拨号',

      success: (res) => {
        if (!res.confirm) {
          return
        }

        wx.makePhoneCall({
          phoneNumber: contact.phone.replace(/[\s-]/g, '')
        })
      }
    })
  }
})