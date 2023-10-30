import { setEngine } from 'crypto'

import { Bot, Command, Context, Schema } from 'koishi'

export const name = 'auction'

export const usage = `
  如何开启拍卖：
  拍卖 <限时 单位分钟> [商品名]

    可选参数：-s  允许暗拍

    可选参数：-p <value> 设置起拍价

    注意：参数请写在最前面，不然会被当成商品名的一部分！

  如何竞价：

    出价 <价格>

  如何私聊暗拍：

    暗拍 <价格> <群号>
`

export const inject = ['database']

declare module 'koishi' {
  interface Tables {
      auctionData: ActionData
  }
}

export interface ActionData {
  guildId: string;
  userName: string;
  userId: string;
  price: number;
  sealed: number;
  auctionItem: string;
  endTime: string;
  id:  number
}

export interface Config {
  超级管理员:string[]
}

export const Config: Schema<Config> = Schema.object({
  超级管理员:Schema.array(Schema.string())
    .description("允许管理拍卖的人，每个项目放一个ID")
})

export function apply(ctx: Context, config:Config) {
  extendTable(ctx)
  ctx.guild().command("拍卖 <time:number> [item:text]", "自动进行拍卖程序", { checkArgCount: true })
    .option("sealed", "-s 允许暗拍")
    .option("startPrice", "-p <value:number> 起拍价", {fallback: 0})
    .usage('注意：参数请写在最前面，不然会被当成商品名的一部分！')
    .example('拍卖 -s 30 koishi的神秘照片  开始拍卖koishi的神秘照片，限时30分钟，允许暗拍')
    .action(async ({session, options}, time, item) => {
      if (config.超级管理员.includes(String(session.event.user.id))) {
        let temp = await ctx.database.get('auctionData', {
          guildId: session.event.guild.id,
        });
        if (temp.length === 0) {
          let timeNow = new Date();
          timeNow.setMinutes(timeNow.getMinutes() + time);
          await ctx.database.create("auctionData", {
            guildId: session.event.guild.id, 
            userName: null,
            userId: "0",
            price: options.startPrice,
            sealed: (options.sealed ? 1 : 0),
            auctionItem: (item ?? "商品"),
            endTime: `${timeNow.getHours()}:${("0" + timeNow.getMinutes()).slice(-2)}`
          })

          await session.send(`拍卖开始${item ? "\n商品：" + item : ""}
起拍价：${options.startPrice}
限时${time}分钟`);
          await wait(time * 60 * 1000);

          let temp = await ctx.database.get('auctionData', {
            guildId: session.event.guild.id,
          });

          if (temp.length > 0) session.execute("拍卖.结束拍卖")

        } else {
          return "本群已有拍卖正在进行"
        }
        
      }
    })

  ctx.guild().command("拍卖").subcommand(".出价 <userPrice:number>", "竞拍时出价", { checkArgCount: true }).alias("出价")
    .example("拍卖.出价 100")
    .action(async ({session}, userPrice) => {
      let auctionDataNow2 = await ctx.database.get('auctionData', {
        guildId: session.event.guild.id,
      });
      if (auctionDataNow2.length === 0) {
        return "本群没有正在进行的拍卖"
      } else {
        if (userPrice > auctionDataNow2[0].price) {
          await ctx.database.set('auctionData', {guildId: session.event.guild.id}, {
            userName: session.username,
            userId: session.event.user.id,
            price: userPrice,
          })
          return `${auctionDataNow2[0].auctionItem === "商品" ? "" : "商品：" + auctionDataNow2[0].auctionItem}
新的出价：${userPrice}
出价者：${session.username}
出价者ID：${session.event.user.id}
拍卖将在${auctionDataNow2[0].endTime}结束`;
        }
      }
      
    })
  
  ctx.private().command("暗拍 <userPrice:number> <userGuildId:text>", "私聊暗拍", { checkArgCount: true }).alias("暗拍")
    .example("暗拍 100 114514(事群号) ")
    .action(async ({session}, userPrice, userGuildId) => {
        let auctionDataNow3 = await ctx.database.get('auctionData', {
          guildId: userGuildId,
        });
        if (auctionDataNow3.length === 0) {
          return "该群没有正在进行的拍卖"
        } else if (auctionDataNow3[0].sealed === 0) {
          return "该群正在进行的拍卖不支持暗拍"
        } else if (userPrice > auctionDataNow3[0].price) {
          await ctx.database.set('auctionData', {guildId: userGuildId}, {
            userName: session.username,
            userId: session.event.user.id,
            price: userPrice,
          })
          await session.bot.sendMessage(userGuildId, `【暗拍】
${auctionDataNow3[0].auctionItem === "商品" ? "" : "商品：" + auctionDataNow3[0].auctionItem}
新的出价：${userPrice}
拍卖将在${auctionDataNow3[0].endTime}结束`);
          return "竞价成功"
        }
      }
    )
  
  ctx.guild().command("拍卖").subcommand(".结束拍卖").alias("结束拍卖")
    .action(async ({session}) => {
      if (config.超级管理员.includes(String(session.event.user.id))) {
        let auctionDataNow4 = await ctx.database.get('auctionData', {
          guildId: session.event.guild.id,
        });
        if (auctionDataNow4.length === 0) {
          return "本群没有正在进行的拍卖"
        } else {
          if (auctionDataNow4[0].userName === null) {
            await ctx.database.remove('auctionData', {guildId: session.event.guild.id});
            return "本次拍卖结束，无人竞价";
          }

          await session.send(`本次拍卖结束
${auctionDataNow4[0].auctionItem}由${auctionDataNow4[0].userName}(${auctionDataNow4[0].userId})拍得
出价：${auctionDataNow4[0].price}`);
          await ctx.database.remove('auctionData', {guildId: session.event.guild.id});
        }
        }
      }
    )
}

async function wait(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function extendTable(ctx) {
  await ctx.model.extend("auctionData", {
    id: "unsigned",
    guildId: "text",
    userName: "text",
    userId: "text",
    price: "double",
    sealed: "unsigned",
    auctionItem: "text",
    endTime: "text"
  }, {primary: 'id', autoInc: true})
}

