import {  Item, FLOW_ACTION , NODE_ACTION, IExecution , dateDiff } from './';
import { DefaultAppDelegate } from './';
import { AppServices } from './appServices';
import { AppUtils } from './appUtils';

const Mailer = require('../userAccess/config/mail');

const fs = require('fs');

var seq = 1;

const MULTI_APP_SERVICES =false;

const nodemailer = require("nodemailer");

console.log('appDelegate from ',__filename);

const iconv = require('iconv-lite');

const MessageServerUrl = 'http://10.0.0.173:12345';

class MyAppDelegate extends DefaultAppDelegate{
    winSocket;
    appServices;
    appUtils;
    collService_;
    
    constructor(server) {
        super(server);
        this.appUtils = new AppUtils(server);
        this.collService_ = new CollService(server);
    }

    collService() {
        return this.collService_;
    }
   

    async getServicesProvider(context) {

        // for multiple appServices  -start 
        if (MULTI_APP_SERVICES) {
            this.appServices = new Map();

                console.log('call services provider', context.instance.tenantId);
                const path = './' + context.instance.tenantId + '_appServices';

                let instance = this.appServices.get(path);

                if (!instance) {
                    const IMPORT = await import(path)
                    const aClass = IMPORT.AppServices;
                    instance = new aClass(this);
                    this.appServices.set(path, instance);
                    console.log('instance loaded', path, instance);
                }
                return instance;
            // for multiple appServices  -end 
        }
    else
        {
        if (this.appServices == null)
        this.appServices = new AppServices(this);
        return this.appServices
        }
        
    }
    /**
    * is fired on application startup
    **/
    async startUp(options) {

        await super.startUp(options);
		if (options['cron'] == false) {
			return;
		}

        console.log('myserver started');

        var query = { "items.status": "start" };

        var list = await this.server.dataStore.findItems(query);
        if (list.length > 0) {
            this.server.logger.log("** There are " + list.length," items that seems to be hung");
            list.forEach(it=>{
                console.log('   item:',it.elementId,it.processName);
            });
        }

        var list = await this.server.dataStore.locker.list();

        let date=new Date();
        date.setDate(date.getDate() -1);

        var list = await this.server.dataStore.locker.delete({ time: { $lte: date } });

        console.log('-- Current Locks --')
        if (list.length > 0) {
            console.log('current locks ...', list.length);
            for (var i = 0; i < list.length; i++) {
                let item = list[i];
                console.log('lock:', item.id, item.server, item.time,dateDiff(item.time));
            }
        }
    

    }
    /**
     * sends emails is called by Notification class
     * 
     * @param to
     * @param subject
     * @param text
     */

    async sendEmail(to, subject, text) {

        let emailMsg;
        if (process.env.EMAIL_ENABLE == 'true')
        {
            // send mail with defined transport object
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                }
            });

            const info = await transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: to,
                subject: subject,  //"Hello ?", // Subject line
                text: text, // plain text body
                html: text //"<b>Hello world?</b>", // html body
            });
            emailMsg=info.messageId;
            console.log("Message sent: %s", info.messageId);
        }
        else
            emailMsg='email disabled by .env';

        let emailLog=process.env.EMAIL_LOG;
        if(emailLog && emailLog!=='' ) {
            let log=`\n\nto:${to}\n${subject}\n${text}\n${emailMsg}`;
            fs.appendFileSync(emailLog,log);        
        }
        return emailMsg;
    }

    /* only for show 
    sendEmailSendGrid(to, msg, body) {

        console.log(`Sending email to ${to}`);

        const key = process.env.SENDGRID_API_KEY;

        if (key && (key != '')) {
            const sgMail = require('@sendgrid/mail')
            sgMail.setApiKey(process.env.SENDGRID_API_KEY)

            const email = {
                to: to,
                from: 'ralphhanna@hotmail.com', // Change to your verified sender
                subject: msg,
                text: body,
                html: body
            }

            sgMail
                .send(email)
                .then((response) => {
                    this.server.logger.log('responseCode', response[0].statusCode)
                    this.server.logger.log('responseHeaders', response[0].headers)
                })
                .catch((error) => {
                    console.error('Email Error:' + error)
                })

        }
        else {
            console.log(`email is disabled`);
        }

    }
    */

    /**
     * is Called everytime a workflow is completed
     * @param execution 
     */
    async executionEnded(execution: IExecution) {
        
    }
    async executionStarted(execution: IExecution) {
        await super.executionStarted(execution);
    }

    async executionEvent(context, event) {

        if (context.item) {

//            console.log(`----->Event: '${event}' for ${context.item.element.type} '${context.item.element.id}' id: ${context.item.id}`);
//            if (event == 'wait' && context.item.element.type == 'bpmn:UserTask')
//                console.log(`----->Waiting for User Input for '${context.item.element.id}' id: ${context.item.id}`);
        }
 //       else
 //           console.log('----->All:' + event, context.definition.name);

    
    }
    async messageThrown(messageId, data, matchingQuery, item: Item) {
        await super.messageThrown(messageId, data, matchingQuery,item);
    }
    async signalThrown(signalId, data, matchingQuery, item: Item) {
        await super.signalThrown(signalId, data, matchingQuery, item);
    }
    async serviceCalled(input, context) {
        this.server.logger.log("service called");

    }
}


const ActionType = {  
    Normal: "normal", // 普通  
}
const WorkflowType = {  
    WorkflowType_Unknow: "-1", // 未知  
    WorkflowType_Commit: "1",   // 启动/创建  
    WorkflowType_Askfor: "4",    // 求指派  
    WorkflowType_Assign: "5",     // 指派  
    WorkflowType_Handle: "8",     // 处理任务  
    WorkflowType_Close: "15",     // 确认/关闭/完成  
    WorkflowType_Reopen: "16",     //   
  };  
    
const WorkflowResult = {  
    WorkflowResult_Resolve: "3",     // 解决   流程往下走      已 操作  
    WorkflowResult_Reject: "4",      // 拒绝   回到上一个人    拒绝    
    WorkflowResult_Cancel: "5",      // 取消   搁置，等待        
};  
class CollService {    
    server;
    constructor(server) {
        this.server = server;
        let self = this;        
    }
  
    getItemStatus_t(type, result) {  
        let action;  
        switch (type) {  
          case WorkflowType.WorkflowType_Commit:  
            action = '提交';  
            break;  
          case WorkflowType.WorkflowType_Askfor:  
            action = '求指派';  
            break;  
          case WorkflowType.WorkflowType_Assign:  
            action = '指派';  
            break;  
          case WorkflowType.WorkflowType_Handle:  
            action = '处理';  
            break;  
          case WorkflowType.WorkflowType_Close:  
            action = '关闭';  
            break;  
          case WorkflowType.WorkflowType_Reopen:  
            action = '重新激活';  
            break;  
          default:  
            action = '未知';  
        }  
        
        switch (result) {  
          case WorkflowResult.WorkflowResult_Resolve:  
            return `已${action}`;  
          case WorkflowResult.WorkflowResult_Reject:  
            return `拒绝了${action}`;  
          case WorkflowResult.WorkflowResult_Cancel:  
            return `取消了${action}`;  
          default:  
            return '未知';  
        }  
    }

    getItemStatus__(type, result) {  
        return iconv.encode(this.getItemStatus_t(type, result), 'UTF-8').toString();        
    }
    getItemStatus(type, result) {  
        return iconv.encode(this.getItemStatus_t(type, result), 'UTF-8').toString();                
    }
       

    startWorkflow_method(item, data, nextActions) {
        console.log("start with data ", data);

        let instanceData = item.token.execution.instance.data;
        
        let userId = data.senderId
        let groupId = data.groupId

        // 避免被覆盖   data is instance.data
        instanceData.applicant_ = data.applicant_ || userId;
        instanceData.cur_applicant = data.applicant_;
        instanceData.groupId_ = data.groupId;
        instanceData.priority_ = data.priority;
        
        let time = Math.floor(Date.now() / 1000);
        let users = {applicant:data.applicant_}
        let result = data.result;
        item.vars.outMessage = {itemId:item.id, time, method:"startWorkflow", nextActions,type:WorkflowType.WorkflowType_Commit,result,groupId,receiverIds:[data.cur_applicant],senderId:userId,priority:data.priority,users};

        this.base_method(item, data, users);
    }

    askfor_method(item, data, nextActions)  {
        console.log("data is:    ", data);
        let userId = data.senderId
        let groupId = data.groupId

        let result = data.result;
        let time = Math.floor(Date.now() / 1000);
        let users = data.users;// {applicant:userId}
        let receiverId = data.cur_applicant;
        item.vars.outMessage = {itemId:item.id, time, method:"askforAssign", nextActions, type:WorkflowType.WorkflowType_Askfor,result,groupId,receiverIds:[receiverId],senderId:userId,priority:data.priority,users};

        this.base_method(item, data, users);
    }
    assign_method(item, data, nextActions) {  
        // 这里是上一步，求指派过来的数据  
        console.log("assign data is ", data);
        let userId = data.senderId
        let leader = data.loopKey || data.assigners[0]
        let groupId = data.groupId
        
        let result = data.result;
        let time = Math.floor(Date.now() / 1000);
        let users = data.users;//{leaders:[leader]}
        let receiverId = leader;
        console.log("leader :", leader)
        // 调用业务的消息
        item.vars.outMessage = {itemId:item.id, time, method:"assignWorker", nextActions, type:WorkflowType.WorkflowType_Assign,result,groupId,receiverIds:[receiverId],senderId:userId,priority:data.priority,users};
     
        this.base_method(item, data, users);
    }
    handleWork_method(item, data, nextActions) {
        console.log("handlework: data is :", data);
        //console.log("handlework: this.item is :", item);
        //console.log("handlework: this.instance is :", item.token.execution.instance);
        let userId = data.senderId        
        let groupId = data.groupId
        let time = Math.floor(Date.now() / 1000);
        let users = data.users;
        let method = "handleWork";
        let type = WorkflowType.WorkflowType_Handle;
        var receiverId = data.loopKey || data.users.workers[0];
        /*
        var needSend = true;
        if (data?.workLoopHandled !== undefined) {
            needSend = !data.workLoopHandled
            data.workLoopHandled = true;
        }
        var receiverIds = data.users.workers;
        */
        let result = data.result;
        item.vars.outMessage = {itemId:item.id, time, method, nextActions, type,result,groupId,receiverIds:[receiverId],senderId:userId,priority:data.priority,users }
        this.base_method(item, data, users);
        console.log("handle work messsage: ", item.vars.outMessage);
    }
    // applicant confirm the work
    applicantConfirm_method(item, data, nextActions) {
        console.log("confirm data: ", data)		
        let userId = data.senderId 
        let groupId = data.groupId
        let applicant = data.users.applicant;
        let users = data.users;//{applicant, workers:[userId]}
        let time = Math.floor(Date.now() / 1000);
        let type = WorkflowType.WorkflowType_Close;
        let result = data.result;

        item.vars.outMessage = {itemId:item.id, time, method:"closeWork", type, nextActions, groupId,priority:data.priority,users, receiverIds:[applicant],senderId:userId,result}
           
        this.base_method(item, data, users);		   
    }

    reopen_method(item, data, nextActions) {
        console.log("reopen data: ", data)	
        let userId = data.senderId 
        let groupId = data.groupId            
        let users = data.users;
        let time = Math.floor(Date.now() / 1000);
        let method = "endWork";
        let type = "16";        
        item.vars.outMessage = {itemId:item.id, time, method, type, nextActions, groupId,priority:data.priority,users, receiverIds:[users.applicant],senderId:userId,result:data.result}
        this.base_method(item, data, users);	
    }

    base_method(item, data, users, needSengMessage=true) {
        let userId = data.senderId          
        let groupId = data.groupId

        item.vars.inMessage = JSON.parse(JSON.stringify(data));
        item.vars.mode = "business";          
        item.vars.status = this.getItemStatus(data.type, data.result);
        
        console.log("data.desc", data.desc)
        item.vars.outMessage.desc = JSON.parse(JSON.stringify(data.desc));
        item.vars.outMessage.desc.resource.workflowItemId = item.id;

        let time = Math.floor(Date.now() / 1000);        
        let msgText = JSON.stringify(item.vars.outMessage)          
        let message={sendid:userId,workflowItemId:item.id,targetid:groupId,msgType:101,time,clientType:0,content:[{msgText}]}
        console.log("message is:", JSON.stringify(message));

        if (needSengMessage) {
            this.sendMessage("0",groupId,JSON.stringify(message));
        }
    }

    sendMessage(from, to, message) {
            const bent = require('bent');
            const getJson = bent('json');
            const token = '';            
            //let message_server_url = 'http://10.0.0.173:12345'; 
            const url = `${MessageServerUrl}/sendMessage.do?from=${from}&to=${to}&token=${token}&message=${message}`;            
            getJson(url).then((result) => {
                console.log(result);                
            }).catch((err) => {
                console.log(err.statusCode);                
            })

            console.log('>>>>>>>>>>appDelegate sendmessage', from, to, message);
    }    

    findLoopObjectById(obj) {
        for (const key in obj) {
          const childObject = obj[key];
          if (childObject.elementId !== undefined) {
            return childObject;
          }
        }
        return null;
    }

    async getFirstItemUser(data) {   
        let instance = await this.server.dataStore.findInstances({ "items.id" : data.id});          
        if (instance.length == 0) { 
            console.log("find no instance")
            return;
        }
        console.log("instance size: ", instance.length)
        console.log("instance is: ", instance[0])
        return instance[0].items[0].vars.users;
    }
    async saveInstanceData(data, outV) {
        // this.server.vars.group = "group1";
        
            let instance = await this.server.dataStore.findInstances({ "items.id" : data.id});          
            if (instance.length == 0) { 
                console.log("find no instance")
                return;
            }
            console.log("data: ", data)
            console.log("server : ", this.server)
            console.log("instance size: ", instance.length)
            console.log("instance is: ", instance[0])
            instance[0].items[0].vars.param1 = data;
            outV = 100;
            return instance[0].items[0].vars.users;
    }
    async showInstanceData(data) {        
            let instance = await this.server.dataStore.findInstances({ "items.id" : data.id});          
            if (instance.length == 0) { 
                console.log("find no instance")
                return;
            }
            console.log("data: ", data)
            console.log("instance size: ", instance.length)
            console.log("instance is: ", instance[0])
            console.log("instance vars is: ", instance[0].items[0].vars.param1)
            instance[0].items[0].vars.param1 = data;            
    }
    async getUsers(data) {   
            console.log('server info:',this.server);           
            console.log('itemId:', data.id); 
            
            if (data && data.caseId) {
                let query = { "data.caseId": data.caseId };
                const items =  await this.server.dataStore.findItems(query);
                console.log('items count',items);   
            }
            const instances = await this.server.dataStore.findInstances( 
                {
                    "items.id": data.id
                });                        
            console.log('instances', instances);
            return null;
    }  
};

class Utils {

}
export {MyAppDelegate}