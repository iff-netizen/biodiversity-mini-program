Page({
  data: {
    posts: []
  },

  onShow() {
    this.loadPosts()
  },

  loadPosts() {
    const observations =
      wx.getStorageSync('observations') || []

    const interactions =
      wx.getStorageSync('interactions') || {}

    const posts =
      observations.map((observation, index) => {
        const observationId =
          String(observation.id || index)

        const interaction =
          interactions[observationId] || {
            liked: false,
            likeCount: 0,
            seen: false,
            seenCount: 0,
            comments: []
          }

        return {
          id: observation.id || index,

          speciesName:
            observation.speciesName,

          scientificName:
            observation.scientificName,

          location:
            observation.locationName || '观察地点',

          time:
            observation.time,

          confidence:
            observation.confidence,

          imagePath:
            observation.imagePath || '',

          content:
            `我在${observation.locationName || '校园附近'}发现了${observation.speciesName}。`,

          liked:
            interaction.liked,

          likeCount:
            interaction.likeCount,

          seen:
            interaction.seen,

          seenCount:
            interaction.seenCount,

          comments:
            interaction.comments || [],

          commentCount:
            (interaction.comments || []).length
        }
      })

    this.setData({
      posts
    })
  },


  // 保存互动数据
  saveInteraction(post) {
    const interactions =
      wx.getStorageSync('interactions') || {}

    const id =
      String(post.id)

    interactions[id] = {
      liked:
        post.liked,

      likeCount:
        post.likeCount,

      seen:
        post.seen,

      seenCount:
        post.seenCount,

      comments:
        post.comments || []
    }

    wx.setStorageSync(
      'interactions',
      interactions
    )
  },


  // 点赞
  toggleLike(e) {
    const id =
      e.currentTarget.dataset.id

    const posts =
      this.data.posts.map(post => {

        if (post.id === id) {

          const liked =
            !post.liked

          post.liked =
            liked

          post.likeCount =
            liked
              ? post.likeCount + 1
              : Math.max(
                  post.likeCount - 1,
                  0
                )

          this.saveInteraction(post)
        }

        return post
      })

    this.setData({
      posts
    })
  },


  // 我也见过
  toggleSeen(e) {
    const id =
      e.currentTarget.dataset.id

    const posts =
      this.data.posts.map(post => {

        if (post.id === id) {

          const seen =
            !post.seen

          post.seen =
            seen

          post.seenCount =
            seen
              ? post.seenCount + 1
              : Math.max(
                  post.seenCount - 1,
                  0
                )

          this.saveInteraction(post)
        }

        return post
      })

    this.setData({
      posts
    })
  },


  // 添加评论
  addComment(e) {
    const id =
      e.currentTarget.dataset.id

    wx.showModal({
      title: '发表评论',

      editable: true,

      placeholderText:
        '说说你的发现或想法',

      success: (res) => {

        if (
          !res.confirm ||
          !res.content ||
          !res.content.trim()
        ) {
          return
        }

        const content =
          res.content.trim()

        const posts =
          this.data.posts.map(post => {

            if (post.id === id) {

              const newComment = {
                id: Date.now(),

                username:
                  '自然观察者',

                content,

                time:
                  new Date().toLocaleString()
              }

              post.comments =
                [
                  ...(post.comments || []),
                  newComment
                ]

              post.commentCount =
                post.comments.length

              this.saveInteraction(post)
            }

            return post
          })

        this.setData({
          posts
        })
      }
    })
  },


  goToSpeciesDetail(e) {
    const name =
      e.currentTarget.dataset.name

    wx.navigateTo({
      url:
        `/pages/species/species?name=${encodeURIComponent(name)}`
    })
  }
})